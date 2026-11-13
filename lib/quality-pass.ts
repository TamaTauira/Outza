import { JOB_CONNECTION_LIMIT } from '@/lib/db-url'
import { prisma, runWithJobPrisma } from '@/lib/prisma'
import { makeSeriesKey, sydneyToday } from '@/lib/event-store'
import { reconcileSuburb, refineStoredCategory } from '@/lib/categories'
import { tidyVenueName } from '@/lib/cities'
import { repairKnownListingUrl, usableUrl } from '@/lib/listing-link'
import { SOURCES, inferRecurrence, parsePriceRange } from '@/lib/quality'
import { fieldConflicts } from '@/lib/listing-window'
import { assertNoOwnershipTransfer, decideDuplicate } from '@/lib/event-identity'
import { duplicateGroupKeys, duplicatePeerClauses } from '@/lib/duplicate-peers'
import { duplicateSpikeAlert, recordQualityAlert } from '@/lib/source-health'
import { STALE_AFTER_DAYS, staleAlertDetail, staleShareAlert } from '@/lib/listing-freshness'
import { runVerificationPass } from '@/lib/verification-pass'
import { runLinkedFill } from '@/lib/linked-fill-run'
import { yieldIfBudget } from '@/lib/source-budget'
import { changedSince, readJobCursor, writeJobCursor } from '@/lib/job-watermark'

async function inBatches<T>(items: T[], size: number, fn: (t: T) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += size) {
    if (yieldIfBudget('quality pass')) return
    await Promise.all(items.slice(i, i + size).map(fn))
  }
}

/**
 * Runs after every refresh: backfills quality fields, merges cross-source duplicates
 * that slipped through ingestion, and labels recurring series.
 */
export function runQualityPass() {
  // Own client even when the quality cron calls this outside a refresh, so the
  // batched updates cannot take the connections event pages are using.
  return runWithJobPrisma(() => runQualityPassInner())
}

function earlierCursor(current: Date, candidate?: Date): Date {
  if (!candidate || candidate >= current) return current
  return candidate
}

const DUP_SELECT = {
  id: true, title: true, venueName: true, venueAddress: true, time: true, endTime: true, price: true, city: true, date: true,
  latitude: true, longitude: true,
  source: true, sources: true, promoterId: true, createdAt: true, status: true, statusSource: true,
  organiserName: true, organiserEditedAt: true,
  ticketUrl: true, sourceUrl: true, organiserUrl: true,
  fieldOverrides: { where: { active: true }, select: { id: true }, take: 1 },
  _count: { select: { savedBy: true, attendees: true, promotions: true } },
} as const

type DupRow = Awaited<ReturnType<typeof prisma.event.findMany<{ select: typeof DUP_SELECT }>>>[number]
const DUP_PAGE = 800

/**
 * Upcoming listings, one page at a time. A single read of every open row hydrates
 * tens of thousands of records before the budget can be checked.
 */
async function readOpenListings(today: Date, note: (n: number) => void): Promise<DupRow[] | null> {
  const rows: DupRow[] = []
  let after: string | undefined
  for (;;) {
    if (yieldIfBudget('duplicate scan')) return null
    const page = await prisma.event.findMany({
      where: { date: { gte: today }, duplicateOfId: null, ...(after ? { id: { gt: after } } : {}) },
      select: DUP_SELECT,
      orderBy: { id: 'asc' },
      take: DUP_PAGE,
    })
    note(page.length)
    rows.push(...page)
    if (page.length < DUP_PAGE) return rows
    after = page[page.length - 1].id
  }
}

/** Changed listings, the other rows on that city and day, and the same listing URL on that day in any city. */
async function duplicateCandidates(today: Date, cursor: Date | null, note: (n: number) => void) {
  const open = { date: { gte: today }, duplicateOfId: null }
  if (!cursor) return readOpenListings(today, note)
  const touched = await prisma.event.findMany({
    where: { ...open, updatedAt: { gt: cursor } },
    select: { city: true, date: true, sourceUrl: true, ticketUrl: true, organiserUrl: true },
    take: 1501,
  })
  note(touched.length)
  if (!touched.length) return [] as Awaited<ReturnType<typeof prisma.event.findMany<{ select: typeof DUP_SELECT }>>>
  if (touched.length > 1500) return readOpenListings(today, note)
  const rows = await prisma.event.findMany({
    where: { ...open, OR: duplicatePeerClauses(touched) },
    select: DUP_SELECT,
  })
  note(rows.length)
  return rows
}

async function runQualityPassInner() {
  const today = sydneyToday()
  const started = new Date()
  const cursor = await readJobCursor('quality').catch((err) => {
    console.error('[quality] watermark read failed', (err as { message?: string })?.message)
    return null
  })
  const changed = changedSince(cursor)
  const upcoming = { date: { gte: today }, ...changed }
  let rowsRead = 0
  let backfilled = 0
  let complete = true
  const note = (n: number) => { rowsRead += n }
  const unfinished = (merged = 0) => {
    complete = false
    console.log('[quality] stopped at time budget', { rowsRead })
    return { backfilled, merged, recurringSeries: 0, places: 0, categories: 0, audited: 0, expiredHidden: 0, rowsRead }
  }

  // 0) Keep a usable source link. Repaired and copied only; a good URL is never cleared.
  const links = await backfillListingLinks(today, cursor, note)

  // 1) Backfill fields for listings created before the quality fields existed
  await prisma.$executeRaw`UPDATE "Event" SET "sources" = ARRAY["source"] WHERE cardinality("sources") = 0 AND "date" >= ${today}`
  await prisma.$executeRaw`UPDATE "Event" SET "lastVerifiedAt" = "updatedAt" WHERE "lastVerifiedAt" IS NULL AND "date" >= ${today}`
  const missing = await prisma.event.findMany({
    where: { ...upcoming, OR: [{ seriesKey: null }, { priceMin: null, price: { not: null } }, { priceMin: null, isFree: true }] },
    select: { id: true, title: true, venueName: true, city: true, isFree: true, price: true, seriesKey: true, updatedAt: true },
    ...(cursor ? { take: 2000, orderBy: { updatedAt: 'asc' as const } } : {}),
  })
  note(missing.length)
  backfilled = missing.length
  await inBatches(missing, JOB_CONNECTION_LIMIT, (e) => {
    const r = parsePriceRange(e.isFree, e.price)
    return prisma.event.update({
      where: { id: e.id },
      data: { seriesKey: e.seriesKey ?? makeSeriesKey(e.title, e.venueName, e.city), priceMin: r.min, priceMax: r.max },
    })
  })

  if (yieldIfBudget('quality pass')) return unfinished()

  // 2) Merge duplicates. Same city and day stay together. The same listing URL and
  // start are one group in any city. Another night on that page stays separate.
  // A city-day of a few hundred listings is millions of pairwise comparisons. That
  // work is synchronous, so the budget timer cannot fire until it returns. Poll the
  // deadline and yield so the pass stops inside its budget instead of at the 300s kill.
  const rows = await duplicateCandidates(today, cursor, note)
  if (!rows || yieldIfBudget('duplicate grouping')) return unfinished()
  const groups = new Map<string, DupRow[]>()
  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && i % 400 === 0 && yieldIfBudget('duplicate grouping')) return unfinished()
    const r = rows[i]
    const keys = duplicateGroupKeys({
      city: r.city,
      date: r.date.toISOString().slice(0, 10),
      urls: [r.sourceUrl, r.ticketUrl, r.organiserUrl],
    })
    for (const key of keys) {
      const list = groups.get(key)
      if (list) list.push(r)
      else groups.set(key, [r])
    }
  }
  // Organiser-owned and promoted listings always win; then the most trusted source; then community activity
  const rank = (r: DupRow) =>
    (r.promoterId || r._count.promotions || r.organiserEditedAt || r.fieldOverrides.length ? 1000 : 0) + (SOURCES[r.source]?.trust ?? 20) + r._count.savedBy + r._count.attendees
  let merged = 0
  const audits: { eventId: string; action: string; detail: string }[] = []
  const consumed = new Set<string>()
  let pairChecks = 0
  const asIdentity = (row: DupRow) => ({
    title: row.title,
    venueName: row.venueName,
    city: row.city,
    date: row.date.toISOString().slice(0, 10),
    time: row.time,
    source: row.source,
    organiserName: row.organiserName,
    address: row.venueAddress,
    status: row.status,
    price: row.price,
    url: row.sourceUrl || row.ticketUrl,
    lat: row.latitude,
    lng: row.longitude,
  })
  for (const list of groups.values()) {
    if (list.length < 2) continue
    if (yieldIfBudget('duplicate grouping')) return unfinished(merged)
    const used = new Set<string>(consumed)
    const sorted = [...list].sort((a, b) => rank(b) - rank(a) || a.createdAt.getTime() - b.createdAt.getTime())
    for (const primary of sorted) {
      if (used.has(primary.id)) continue
      used.add(primary.id)
      const primaryIdentity = asIdentity(primary)
      const protectedRow = (o: DupRow) => !!(o.promoterId || o._count.promotions || o.organiserEditedAt || o.fieldOverrides.length)
      const blocked: DupRow[] = []
      const reviews: DupRow[] = []
      const dups: DupRow[] = []
      let overBudget = false
      for (const other of sorted) {
        if (used.has(other.id)) continue
        if ((++pairChecks & 63) === 0) {
          await new Promise((resolve) => setImmediate(resolve))
          if (yieldIfBudget('duplicate grouping')) { overBudget = true; break }
        }
        const action = decideDuplicate(primaryIdentity, asIdentity(other)).action
        if (action !== 'link' && action !== 'review') continue
        if (protectedRow(other)) blocked.push(other)
        else if (action === 'review') reviews.push(other)
        else dups.push(other)
      }
      if (overBudget) return unfinished(merged)
      for (const other of blocked) {
        audits.push({
          eventId: other.id,
          action: 'DUPLICATE_FLAGGED',
          detail: `Likely duplicate of ${primary.id} (${primary.title}). Left in place because it is organiser-owned or promoted.`,
        })
      }
      for (const other of reviews) {
        audits.push({
          eventId: other.id,
          action: 'DUPLICATE_REVIEW',
          detail: `Possible duplicate of ${primary.id} (${primary.title}). Left public because the match is not certain.`,
        })
      }
      if (!dups.length) continue
      dups.forEach((d) => { used.add(d.id); consumed.add(d.id) })
      for (const dup of dups) {
        audits.push({
          eventId: dup.id,
          action: 'DUPLICATE_MERGED',
          detail: `Linked as a duplicate of ${primary.id} (${primary.title}). The listing stays in the database and drops off public boards.`,
        })
        const conflicts = fieldConflicts(primary, dup)
        if (conflicts.length) {
          audits.push({
            eventId: primary.id,
            action: 'TIME_CONFLICT',
            detail: `Kept ${primary.id} (${primary.title}). ${dup.source} disagreed: ${conflicts.join('; ')}. Provenance stays on sources. Nothing was deleted.`,
          })
        }
      }
      const sources = [...new Set([...primary.sources, primary.source, ...dups.flatMap((d) => [d.source, ...d.sources])])]
      const fill: Record<string, unknown> = { sources }
      // Price, times, ticket link, image, address and description are filled by the linked-field pass
      // so the source that supplied each blank is recorded. A review pair never reaches this list.
      for (const key of ['sourceUrl', 'organiserUrl'] as const) {
        if (usableUrl(primary[key])) continue
        const found = dups.map((d) => usableUrl(repairKnownListingUrl(d[key], d.source))).find((u): u is string => !!u)
        if (found) fill[key] = found
      }
      const flagged = dups.find((d) => d.status !== 'SCHEDULED')
      if (primary.status === 'SCHEDULED' && flagged) Object.assign(fill, { status: flagged.status, statusSource: flagged.statusSource ?? flagged.source })
      assertNoOwnershipTransfer(fill)
      await prisma.event.update({ where: { id: primary.id }, data: fill })
      await prisma.event.updateMany({ where: { id: { in: dups.map((d) => d.id) } }, data: { duplicateOfId: primary.id } })
      merged += dups.length
    }
  }
  let linkedFill: { wouldUpdate: number; updated: number; gainPrice: number; gainTime: number } | null = null
  if (!yieldIfBudget('linked fill')) {
    try {
      linkedFill = await runLinkedFill({ dryRun: false, since: cursor })
    } catch (err) {
      console.error('[quality] linked fill failed', (err as { message?: string })?.message)
    }
  }

  if (duplicateSpikeAlert(rows.length, merged)) {
    await recordQualityAlert({
      kind: 'DUPLICATE_SPIKE',
      source: 'quality-pass',
      detail: `${merged} of ${rows.length} upcoming listings were linked as duplicates in one pass. Listings were linked, not deleted.`,
    })
  }

  // 3) Recurring series: same normalised title + venue + city on 3+ upcoming dates.
  // Only series touched since the cursor, but every upcoming date in those series.
  const seriesWhere = { date: { gte: today }, duplicateOfId: null, seriesKey: { not: null } }
  let seriesKeys: string[] | null = null
  if (cursor) {
    const touchedKeys = await prisma.event.findMany({
      where: { ...seriesWhere, updatedAt: { gt: cursor } },
      select: { seriesKey: true },
      distinct: ['seriesKey'],
      take: 500,
    })
    note(touchedKeys.length)
    seriesKeys = touchedKeys.map((row) => row.seriesKey!).filter(Boolean)
  }
  const series = seriesKeys && !seriesKeys.length
    ? []
    : await prisma.event.findMany({
      where: { ...seriesWhere, ...(seriesKeys ? { seriesKey: { in: seriesKeys } } : {}) },
      select: { seriesKey: true, date: true, recurrence: true },
    })
  note(series.length)
  const byKey = new Map<string, { dates: string[]; current: Set<string | null> }>()
  for (const s of series) {
    const g = byKey.get(s.seriesKey!) ?? { dates: [], current: new Set() }
    g.dates.push(s.date.toISOString().slice(0, 10))
    g.current.add(s.recurrence)
    byKey.set(s.seriesKey!, g)
  }
  let recurring = 0
  const updates: [string, string | null][] = []
  for (const [key, g] of byKey) {
    const rec = inferRecurrence(g.dates)
    if (rec) recurring++
    if (g.current.size !== 1 || !g.current.has(rec)) updates.push([key, rec])
  }
  await inBatches(updates, JOB_CONNECTION_LIMIT, ([key, rec]) => prisma.event.updateMany({ where: { seriesKey: key, date: { gte: today } }, data: { recurrence: rec } }))

  if (yieldIfBudget('quality pass')) {
    complete = false
    console.log('[quality] stopped at time budget', { rowsRead })
    return { backfilled: missing.length, merged, recurringSeries: recurring, places: 0, categories: 0, audited: 0, expiredHidden: 0, rowsRead }
  }

  // 4) Correct dump-bucket suburbs, city-as-venue names, and known category mistags.
  // Organiser edits are left alone. The same rules run at ingest; this catches rows already stored.
  const review = await prisma.event.findMany({
    where: { ...upcoming, duplicateOfId: null, organiserEditedAt: null },
    select: { id: true, title: true, description: true, venueName: true, venueAddress: true, suburb: true, city: true, category: true, subTags: true, updatedAt: true },
    ...(cursor ? { take: 2000, orderBy: { updatedAt: 'asc' as const } } : {}),
  })
  note(review.length)
  let places = 0
  let categories = 0
  const placeUpdates: { id: string; data: Record<string, unknown> }[] = []
  for (const e of review) {
    const suburb = reconcileSuburb(e.suburb, e.venueName, e.venueAddress, e.city)
    const venueName = tidyVenueName(e.venueName, e.venueAddress, e.city)
    const refined = refineStoredCategory(e)
    const data: Record<string, unknown> = {}
    if ((suburb ?? null) !== (e.suburb ?? null)) data.suburb = suburb
    if (venueName !== e.venueName) {
      data.venueName = venueName
      data.seriesKey = makeSeriesKey(e.title, venueName, e.city)
    }
    if (refined) {
      data.category = refined.category
      data.subTags = refined.subTags
      categories++
    }
    if (data.suburb !== undefined || data.venueName) places++
    if (Object.keys(data).length) placeUpdates.push({ id: e.id, data })
  }
  await inBatches(placeUpdates, JOB_CONNECTION_LIMIT, (u) => prisma.event.update({ where: { id: u.id }, data: u.data }))

  const expired = await prisma.event.count({ where: { date: { lt: today }, duplicateOfId: null, status: 'SCHEDULED' } })
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000)
  const recent = await prisma.qualityAudit.findMany({
    where: { createdAt: { gte: since }, action: { in: ['DUPLICATE_MERGED', 'DUPLICATE_FLAGGED', 'EXPIRED_HIDDEN', 'TIME_CONFLICT'] } },
    select: { eventId: true, action: true },
  })
  const seen = new Set(recent.map((row) => `${row.action}:${row.eventId ?? ''}`))
  const fresh = audits.filter((row) => !seen.has(`${row.action}:${row.eventId}`)).slice(0, 200)
  if (!seen.has('EXPIRED_HIDDEN:')) {
    fresh.push({
      eventId: '',
      action: 'EXPIRED_HIDDEN',
      detail: `${expired} scheduled listings are before today. They stay in the database and are hidden from boards. Nothing was deleted.`,
    })
  }
  if (fresh.length) {
    await prisma.qualityAudit.createMany({
      data: fresh.map((row) => ({
        eventId: row.eventId || null,
        action: row.action,
        detail: row.detail,
        status: row.action === 'DUPLICATE_MERGED' ? null : 'OPEN',
      })),
    })
  }

  const upcomingCount = await prisma.event.count({
    where: { date: { gte: today }, duplicateOfId: null, deletedAt: null, status: 'SCHEDULED' },
  })
  const staleBefore = new Date(Date.now() - STALE_AFTER_DAYS * 86400000)
  const staleCount = await prisma.event.count({
    where: {
      date: { gte: today },
      duplicateOfId: null,
      deletedAt: null,
      status: 'SCHEDULED',
      OR: [{ lastVerifiedAt: null }, { lastVerifiedAt: { lt: staleBefore } }],
    },
  })
  if (staleShareAlert(upcomingCount, staleCount)) {
    await recordQualityAlert({
      kind: 'STALE_LISTINGS',
      source: 'quality-pass',
      detail: staleAlertDetail(staleCount, upcomingCount),
    })
  }

  let verification = { normalized: 0, flagged: 0, checks: 0 }
  if (yieldIfBudget('quality pass')) complete = false
  else verification = await runVerificationPass(new Date(), cursor)
  let cursorOut = started
  if (cursor && missing.length >= 2000) cursorOut = earlierCursor(cursorOut, missing[missing.length - 1]?.updatedAt)
  if (cursor && review.length >= 2000) cursorOut = earlierCursor(cursorOut, review[review.length - 1]?.updatedAt)
  if (complete) {
    await writeJobCursor('quality', cursorOut).catch((err) => console.error('[quality] watermark write failed', (err as { message?: string })?.message))
  }
  const result = { backfilled: missing.length, links, merged, recurringSeries: recurring, places, categories, audited: fresh.length, expiredHidden: expired, verification, linkedFill, rowsRead }
  console.log('[quality] pass complete', result)
  return result
}

/** Fill sourceUrl from a ticket or organiser link already on the row, and repair glued Humanitix hosts. */
async function backfillListingLinks(today: Date, cursor: Date | null, note: (n: number) => void): Promise<number> {
  const rows = await prisma.event.findMany({
    where: { date: { gte: today }, source: 'humanitix', ...(cursor ? { updatedAt: { gt: cursor } } : {}) },
    select: { id: true, ticketUrl: true, sourceUrl: true },
    ...(cursor ? { take: 2000 } : {}),
  })
  note(rows.length)
  let repaired = 0
  await inBatches(rows, JOB_CONNECTION_LIMIT, async (row) => {
    const ticketUrl = repairKnownListingUrl(row.ticketUrl, 'humanitix')
    const sourceUrl = repairKnownListingUrl(row.sourceUrl, 'humanitix') ?? ticketUrl
    if (ticketUrl === row.ticketUrl && sourceUrl === row.sourceUrl) return
    repaired++
    await prisma.event.update({
      where: { id: row.id },
      data: {
        ...(ticketUrl ? { ticketUrl } : {}),
        ...(sourceUrl ? { sourceUrl } : {}),
      },
    })
  })
  const cleared = await prisma.$executeRaw`
    UPDATE "Event" SET
      "ticketUrl" = CASE WHEN "ticketUrl" !~ '^https?://' OR "ticketUrl" ~ '/(undefined|null)/?($|\\?)' THEN NULL ELSE "ticketUrl" END,
      "sourceUrl" = CASE WHEN "sourceUrl" !~ '^https?://' OR "sourceUrl" ~ '/(undefined|null)/?($|\\?)' THEN NULL ELSE "sourceUrl" END
    WHERE "date" >= ${today}
      AND (
        ("ticketUrl" IS NOT NULL AND ("ticketUrl" !~ '^https?://' OR "ticketUrl" ~ '/(undefined|null)/?($|\\?)'))
        OR ("sourceUrl" IS NOT NULL AND ("sourceUrl" !~ '^https?://' OR "sourceUrl" ~ '/(undefined|null)/?($|\\?)'))
      )
  `
  const copiedTicket = await prisma.$executeRaw`
    UPDATE "Event" SET "sourceUrl" = "ticketUrl"
    WHERE "date" >= ${today}
      AND ("sourceUrl" IS NULL OR "sourceUrl" = '')
      AND "ticketUrl" ~ '^https?://'
  `
  const copiedOrg = await prisma.$executeRaw`
    UPDATE "Event" SET "sourceUrl" = "organiserUrl"
    WHERE "date" >= ${today}
      AND ("sourceUrl" IS NULL OR "sourceUrl" = '')
      AND ("ticketUrl" IS NULL OR "ticketUrl" = '')
      AND "organiserUrl" ~ '^https?://'
  `
  const n = (v: unknown) => (typeof v === 'bigint' ? Number(v) : Number(v) || 0)
  return repaired + n(copiedTicket) + n(copiedOrg) + n(cleared)
}
