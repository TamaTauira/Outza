/**
 * Merge listings the dedupe rules now treat as the same event, then re-apply tag rules.
 * Gap-fill still refuses to replace a good value with a weaker one.
 *
 *   npx tsx --require dotenv/config scripts/repair-catalogue.ts
 * Dry run: REPAIR_DRY=1 npx tsx --require dotenv/config scripts/repair-catalogue.ts
 */
import { prisma } from '../lib/prisma'
import { decideDuplicate } from '../lib/event-identity'
import { isWeakVenueName } from '../lib/place-match'
import { planLinkedFill, type FillEvent } from '../lib/linked-fill'
import { makeSeriesKey } from '../lib/event-store'
import { CATEGORIES, refineStoredCategory, retagLgbti } from '../lib/categories'
import { isPaidListing, SOURCES } from '../lib/quality'
import { readPrice } from '../lib/price'
import { recordContribution } from '../lib/source-record'

const dry = process.env.REPAIR_DRY === '1'

const MERGE_SELECT = {
  id: true, title: true, venueName: true, venueAddress: true, suburb: true, time: true, endTime: true, endDate: true,
  price: true, priceMin: true, priceMax: true, isFree: true, feesIncluded: true, city: true, date: true,
  source: true, sources: true, promoterId: true, createdAt: true, status: true, statusSource: true,
  organiserName: true, organiserEditedAt: true, communityKey: true, ticketUrl: true, sourceUrl: true, organiserUrl: true,
  description: true, imageUrl: true, imageLocked: true, latitude: true, longitude: true,
  category: true, subTags: true, isLGBTI: true,
} as const

type Row = Awaited<ReturnType<typeof loadRows>>[number]

async function loadRows() {
  return prisma.event.findMany({
    where: { duplicateOfId: null, deletedAt: null },
    select: MERGE_SELECT,
  })
}

function protectedRow(row: Row): boolean {
  return !!(row.promoterId || row.organiserEditedAt || row.communityKey)
}

function asIdentity(row: Row) {
  return {
    title: row.title,
    venueName: row.venueName,
    city: row.city,
    date: row.date.toISOString().slice(0, 10),
    time: row.time,
    source: row.source,
    organiserName: row.organiserName,
    address: row.venueAddress,
    status: row.status,
    url: row.sourceUrl || row.ticketUrl,
  }
}

function asFill(row: Row, relation?: 'linked'): FillEvent {
  return {
    ...row,
    date: row.date,
    endDate: row.endDate,
    relation,
    organiserEditedAt: row.organiserEditedAt,
    communityKey: row.communityKey,
  }
}

async function mergeDuplicates(rows: Row[]) {
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    if (protectedRow(row)) continue
    const key = `${row.city}|${row.date.toISOString().slice(0, 10)}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const rank = (row: Row) => (SOURCES[row.source]?.trust ?? 20) + (isWeakVenueName(row.venueName, row.venueAddress) ? 0 : 5)
  const pairs: { primary: Row; duplicate: Row }[] = []
  for (const list of groups.values()) {
    const used = new Set<string>()
    const sorted = [...list].sort((a, b) => rank(b) - rank(a) || a.createdAt.getTime() - b.createdAt.getTime())
    for (const primary of sorted) {
      if (used.has(primary.id)) continue
      used.add(primary.id)
      const dups = sorted.filter((other) => !used.has(other.id) && !protectedRow(other) && decideDuplicate(asIdentity(primary), asIdentity(other)).action === 'link')
      for (const duplicate of dups) {
        used.add(duplicate.id)
        pairs.push({ primary, duplicate })
      }
    }
  }
  console.log(`[repair] ${pairs.length} duplicate listings to merge${dry ? ' (dry run)' : ''}`)
  for (const pair of pairs) {
    console.log(`  ${pair.duplicate.id} → ${pair.primary.id} | ${pair.primary.title} | ${pair.duplicate.venueName} → ${pair.primary.venueName} | ${pair.duplicate.source} → ${pair.primary.source}`)
  }
  if (dry || !pairs.length) return pairs.length

  const byPrimary = new Map<string, { primary: Row; dups: Row[] }>()
  for (const pair of pairs) {
    const group = byPrimary.get(pair.primary.id) ?? { primary: pair.primary, dups: [] }
    group.dups.push(pair.duplicate)
    byPrimary.set(pair.primary.id, group)
  }
  for (const { primary, dups } of byPrimary.values()) {
    const sources = [...new Set([primary.source, ...primary.sources, ...dups.flatMap((dup) => [dup.source, ...dup.sources])])]
    const donors = dups.map((dup) => asFill(dup, 'linked'))
    const plan = planLinkedFill(asFill({ ...primary, sources }), donors)
    const data: Record<string, unknown> = { ...plan.patch, sources }
    if (typeof data.venueName === 'string') data.seriesKey = makeSeriesKey(primary.title, data.venueName, primary.city)
    const flagged = dups.find((dup) => dup.status !== 'SCHEDULED')
    if (primary.status === 'SCHEDULED' && flagged) Object.assign(data, { status: flagged.status, statusSource: flagged.statusSource ?? flagged.source })
    await prisma.event.update({ where: { id: primary.id }, data })
    await prisma.event.updateMany({ where: { id: { in: dups.map((dup) => dup.id) } }, data: { duplicateOfId: primary.id } })
    const bySource = new Map<string, string[]>()
    for (const filled of plan.filled) {
      const list = bySource.get(filled.source) ?? []
      list.push(filled.field)
      bySource.set(filled.source, list)
    }
    for (const [source, fields] of bySource) {
      const donor = dups.find((dup) => dup.source === source)
      await recordContribution({
        eventId: primary.id,
        source,
        fields,
        url: donor?.sourceUrl || donor?.ticketUrl,
        date: primary.date.toISOString().slice(0, 10),
        time: typeof data.time === 'string' ? data.time : primary.time,
      })
    }
  }
  return pairs.length
}

function nextFree(row: { isFree: boolean; price: string | null; priceMin: number | null; priceMax: number | null }): boolean {
  if (isPaidListing(row)) return false
  const parsed = readPrice(row.price)
  if (parsed.isFree) return true
  return row.isFree
}

async function retag() {
  const rows = await prisma.event.findMany({
    where: { deletedAt: null, organiserEditedAt: null, communityKey: null },
    select: { id: true, title: true, description: true, category: true, subTags: true, isLGBTI: true, isFree: true, price: true, priceMin: true, priceMax: true },
  })
  const before = new Map<string, number>()
  const after = new Map<string, number>()
  const removed = new Map<string, number>()
  const added = new Map<string, number>()
  for (const cat of CATEGORIES) for (const tag of cat.subTags) {
    before.set(tag, 0)
    after.set(tag, 0)
    removed.set(tag, 0)
    added.set(tag, 0)
  }
  let lgbtiBefore = 0
  let lgbtiAfter = 0
  let freeBefore = 0
  let freeAfter = 0
  let categoryChanges = 0
  const updates: { id: string; data: Record<string, unknown> }[] = []
  for (const row of rows) {
    for (const tag of row.subTags) before.set(tag, (before.get(tag) ?? 0) + 1)
    if (row.isLGBTI) lgbtiBefore++
    if (row.isFree) freeBefore++
    const refined = refineStoredCategory(row)
    const category = refined?.category ?? row.category
    const subTags = refined?.subTags ?? row.subTags
    const isLGBTI = retagLgbti(row.isLGBTI, row.title, row.description)
    const isFree = nextFree(row)
    for (const tag of subTags) after.set(tag, (after.get(tag) ?? 0) + 1)
    if (isLGBTI) lgbtiAfter++
    if (isFree) freeAfter++
    const beforeSet = new Set(row.subTags)
    const afterSet = new Set(subTags)
    for (const tag of beforeSet) if (!afterSet.has(tag)) removed.set(tag, (removed.get(tag) ?? 0) + 1)
    for (const tag of afterSet) if (!beforeSet.has(tag)) added.set(tag, (added.get(tag) ?? 0) + 1)
    if (category !== row.category) categoryChanges++
    const data: Record<string, unknown> = {}
    if (category !== row.category) data.category = category
    if (subTags.join('|') !== row.subTags.join('|')) data.subTags = subTags
    if (isLGBTI !== row.isLGBTI) data.isLGBTI = isLGBTI
    if (isFree !== row.isFree) data.isFree = isFree
    if (Object.keys(data).length) updates.push({ id: row.id, data })
  }
  console.log(`[repair] ${updates.length} listings to re-tag, ${categoryChanges} category changes, LGBTIQ+ ${lgbtiBefore} → ${lgbtiAfter}, free ${freeBefore} → ${freeAfter}${dry ? ' (dry run)' : ''}`)
  const tags = [...before.keys()].sort((a, b) => (before.get(b) ?? 0) - (before.get(a) ?? 0))
  for (const tag of tags) {
    const gone = removed.get(tag) ?? 0
    const plus = added.get(tag) ?? 0
    if (!gone && !plus && !(before.get(tag) ?? 0)) continue
    if (!gone && !plus) continue
    console.log(`  ${tag}: ${before.get(tag) ?? 0} → ${after.get(tag) ?? 0} (removed ${gone}, added ${plus})`)
  }
  if (!dry) {
    for (let i = 0; i < updates.length; i += 40) {
      await Promise.all(updates.slice(i, i + 40).map((row) => prisma.event.update({ where: { id: row.id }, data: row.data })))
    }
  }
  return { updates: updates.length, categoryChanges, lgbtiBefore, lgbtiAfter, freeBefore, freeAfter }
}

async function main() {
  const rows = await loadRows()
  const merged = await mergeDuplicates(rows)
  const tags = await retag()
  console.log('[repair] done', { merged, ...tags, dry })
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
