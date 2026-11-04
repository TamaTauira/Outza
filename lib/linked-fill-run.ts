/**
 * Copy missing fields onto upcoming canonical listings from linked sources.
 * Dry-run reports counts and writes nothing. A second apply is a no-op.
 */
import { Prisma } from '@prisma/client'
import { toSydneyParts } from '@/lib/event-store-parts'
import { plansForRows, type FillEvent, type LinkedFillPlan } from '@/lib/linked-fill'
import { prisma } from '@/lib/prisma'
import { recordContribution } from '@/lib/source-record'
import { yieldIfBudget } from '@/lib/source-budget'

const BATCH = 25

const FILL_SELECT = {
  id: true,
  title: true,
  venueName: true,
  venueAddress: true,
  suburb: true,
  city: true,
  date: true,
  time: true,
  endTime: true,
  endDate: true,
  price: true,
  priceMin: true,
  priceMax: true,
  isFree: true,
  feesIncluded: true,
  latitude: true,
  longitude: true,
  ticketUrl: true,
  imageUrl: true,
  imageLocked: true,
  description: true,
  source: true,
  sources: true,
  duplicateOfId: true,
  organiserName: true,
  status: true,
  organiserEditedAt: true,
  communityKey: true,
  lastVerifiedAt: true,
} as const

export type LinkedFillExample = {
  id: string
  title: string
  city: string
  date: string
  gains: string[]
  from: string[]
}

export type LinkedFillReport = {
  dryRun: boolean
  scanned: number
  wouldUpdate: number
  unchanged: number
  skippedOrganiser: number
  skippedReview: number
  updated: number
  failed: number
  fields: Record<string, number>
  gainPrice: number
  gainTime: number
  examples: LinkedFillExample[]
  plan: string
}

const PLAN = 'Upcoming canonical listings only. Confirmed duplicate links, identifier matches, and sources already named on the listing can fill blank price, start and finish time, street address, map pin, ticket link, image and description. Ticketing sources win for price and times. A value that is already present is kept. Review pairs and hard mismatches are skipped. Times stay in the event city timezone. Apply is idempotent: a second run finds nothing left to fill.'

function missingRelation(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  return code === 'P2021' || code === 'P2022'
}

function dayKey(value: Date | string): string {
  return (value instanceof Date ? value.toISOString() : value).slice(0, 10)
}

function gainsOf(plan: LinkedFillPlan): string[] {
  const fields = new Set(plan.filled.map((row) => row.field))
  const gains: string[] = []
  if (fields.has('time')) gains.push('time')
  if (fields.has('endTime') || fields.has('endDate')) gains.push('endTime')
  if (fields.has('price')) gains.push('price')
  if (fields.has('venueAddress')) gains.push('venueAddress')
  if (fields.has('latitude')) gains.push('coordinates')
  if (fields.has('ticketUrl')) gains.push('ticketUrl')
  if (fields.has('imageUrl')) gains.push('image')
  if (fields.has('description')) gains.push('description')
  return gains
}

function emptyReport(dryRun: boolean): LinkedFillReport {
  return {
    dryRun,
    scanned: 0,
    wouldUpdate: 0,
    unchanged: 0,
    skippedOrganiser: 0,
    skippedReview: 0,
    updated: 0,
    failed: 0,
    fields: {},
    gainPrice: 0,
    gainTime: 0,
    examples: [],
    plan: PLAN,
  }
}

async function candidateIds(today: Date): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Event"
    WHERE "duplicateOfId" IS NULL
      AND "deletedAt" IS NULL
      AND "date" >= ${today}
      AND (
        cardinality("sources") > 1
        OR id IN (SELECT "duplicateOfId" FROM "Event" WHERE "duplicateOfId" IS NOT NULL)
      )
    ORDER BY "date" ASC, id ASC
  `
  return rows.map((row) => row.id)
}

async function lockedFields(ids: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  if (!ids.length) return map
  try {
    const rows = await prisma.eventFieldOverride.findMany({
      where: { eventId: { in: ids }, active: true },
      select: { eventId: true, fieldName: true },
    })
    for (const row of rows) {
      const list = map.get(row.eventId) ?? []
      list.push(row.fieldName)
      map.set(row.eventId, list)
    }
  } catch (err) {
    if (!missingRelation(err)) throw err
  }
  return map
}

async function applyPlan(event: FillEvent, donors: FillEvent[], plan: LinkedFillPlan): Promise<void> {
  await prisma.event.update({
    where: { id: event.id },
    data: plan.patch as Prisma.EventUpdateInput,
  })
  const bySource = new Map<string, string[]>()
  for (const row of plan.filled) {
    const list = bySource.get(row.source) ?? []
    list.push(row.field)
    bySource.set(row.source, list)
  }
  for (const [source, fields] of bySource) {
    const donor = donors.find((row) => row.source === source)
    await recordContribution({
      eventId: event.id!,
      source,
      fields,
      url: donor?.ticketUrl ?? null,
      date: dayKey(event.date),
      time: typeof plan.patch.time === 'string' ? plan.patch.time : event.time,
    })
  }
}

export async function runLinkedFill(opts: { dryRun: boolean }): Promise<LinkedFillReport> {
  const report = emptyReport(opts.dryRun)
  const today = new Date(`${toSydneyParts(new Date()).date}T00:00:00.000Z`)
  const ids = await candidateIds(today)
  const examples: LinkedFillExample[] = []

  for (let i = 0; i < ids.length; i += BATCH) {
    if (yieldIfBudget('linked fill')) break
    const batch = ids.slice(i, i + BATCH)
    let rows: FillEvent[]
    try {
      const canonicals = await prisma.event.findMany({ where: { id: { in: batch } }, select: FILL_SELECT })
      const keys = [...new Map(canonicals.map((row) => [`${row.city}|${row.date.toISOString()}`, { city: row.city, date: row.date }])).values()]
      const pool = keys.length
        ? await prisma.event.findMany({
          where: {
            deletedAt: null,
            OR: [
              { duplicateOfId: { in: batch } },
              { AND: [{ duplicateOfId: null }, { OR: keys.map((key) => ({ city: key.city, date: key.date })) }] },
            ],
          },
          select: FILL_SELECT,
        })
        : []
      const locks = await lockedFields(batch)
      rows = pool.map((row) => ({ ...row, lockedFields: locks.get(row.id) ?? [] }))
    } catch (err) {
      report.failed += batch.length
      console.error('[linked-fill] batch read failed', (err as { message?: string })?.message)
      continue
    }
    const outcomes = plansForRows(rows, new Set(batch))
    for (const outcome of outcomes) {
      report.scanned += 1
      report.skippedReview += outcome.plan.skippedReview
      if (outcome.skip === 'organiser') {
        report.skippedOrganiser += 1
        continue
      }
      if (!outcome.plan.filled.length || !outcome.event.id) {
        report.unchanged += 1
        continue
      }
      report.wouldUpdate += 1
      const gains = gainsOf(outcome.plan)
      if (gains.includes('price')) report.gainPrice += 1
      if (gains.includes('time') || gains.includes('endTime')) report.gainTime += 1
      for (const gain of gains) report.fields[gain] = (report.fields[gain] ?? 0) + 1
      const from = [...new Set(outcome.plan.filled.map((row) => row.source))]
      examples.push({
        id: outcome.event.id,
        title: outcome.event.title,
        city: outcome.event.city ?? '',
        date: dayKey(outcome.event.date),
        gains,
        from,
      })
      if (opts.dryRun) continue
      const donors = rows.filter((row) => row.id !== outcome.event.id && (row.duplicateOfId === outcome.event.id || (!row.duplicateOfId && dayKey(row.date) === dayKey(outcome.event.date) && row.city === outcome.event.city)))
      try {
        await applyPlan(outcome.event, donors, outcome.plan)
        report.updated += 1
      } catch (err) {
        report.failed += 1
        console.error('[linked-fill] update failed', outcome.event.id, (err as { message?: string })?.message)
      }
    }
  }

  const courtney = examples.find((row) => row.city === 'Brisbane' && row.date === '2026-11-04' && /courtney barnett/i.test(row.title))
  const price = examples.filter((row) => row.gains.includes('price')).slice(0, 8)
  const times = examples.filter((row) => !row.gains.includes('price') && (row.gains.includes('time') || row.gains.includes('endTime'))).slice(0, 8)
  const picked = [...(courtney ? [courtney] : []), ...price, ...times]
  const seen = new Set<string>()
  report.examples = picked.filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)))
  return report
}
