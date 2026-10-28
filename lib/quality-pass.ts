import { prisma } from '@/lib/prisma'
import { makeSeriesKey, sydneyToday } from '@/lib/event-store'
import { reconcileSuburb, refineStoredCategory } from '@/lib/categories'
import { tidyVenueName } from '@/lib/cities'
import { SOURCES, inferRecurrence, isSameEvent, parsePriceRange } from '@/lib/quality'

async function inBatches<T>(items: T[], size: number, fn: (t: T) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn))
}

/**
 * Runs after every refresh: backfills quality fields, merges cross-source duplicates
 * that slipped through ingestion, and labels recurring series.
 */
export async function runQualityPass() {
  const today = sydneyToday()
  const upcoming = { date: { gte: today } }

  // 1) Backfill fields for listings created before the quality fields existed
  await prisma.$executeRaw`UPDATE "Event" SET "sources" = ARRAY["source"] WHERE cardinality("sources") = 0 AND "date" >= ${today}`
  await prisma.$executeRaw`UPDATE "Event" SET "lastVerifiedAt" = "updatedAt" WHERE "lastVerifiedAt" IS NULL AND "date" >= ${today}`
  const missing = await prisma.event.findMany({
    where: { ...upcoming, OR: [{ seriesKey: null }, { priceMin: null, price: { not: null } }, { priceMin: null, isFree: true }] },
    select: { id: true, title: true, venueName: true, city: true, isFree: true, price: true, seriesKey: true },
  })
  await inBatches(missing, 20, (e) => {
    const r = parsePriceRange(e.isFree, e.price)
    return prisma.event.update({
      where: { id: e.id },
      data: { seriesKey: e.seriesKey ?? makeSeriesKey(e.title, e.venueName, e.city), priceMin: r.min, priceMax: r.max },
    })
  })

  // 2) Merge duplicates (same city + date, fuzzy title/venue/time match)
  const rows = await prisma.event.findMany({
    where: { ...upcoming, duplicateOfId: null },
    select: {
      id: true, title: true, venueName: true, time: true, endTime: true, price: true, city: true, date: true,
      source: true, sources: true, promoterId: true, createdAt: true, status: true, statusSource: true,
      _count: { select: { savedBy: true, attendees: true, promotions: true } },
    },
  })
  const groups = new Map<string, typeof rows>()
  for (const r of rows) {
    const k = `${r.city}|${r.date.toISOString().slice(0, 10)}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  // Organiser-owned and promoted listings always win; then the most trusted source; then community activity
  const rank = (r: (typeof rows)[number]) =>
    (r.promoterId || r._count.promotions ? 1000 : 0) + (SOURCES[r.source]?.trust ?? 20) + r._count.savedBy + r._count.attendees
  let merged = 0
  for (const list of groups.values()) {
    const used = new Set<string>()
    const sorted = [...list].sort((a, b) => rank(b) - rank(a) || a.createdAt.getTime() - b.createdAt.getTime())
    for (const primary of sorted) {
      if (used.has(primary.id)) continue
      used.add(primary.id)
      const dups = sorted.filter((o) => !used.has(o.id) && !o.promoterId && !o._count.promotions && isSameEvent(primary, o))
      if (!dups.length) continue
      dups.forEach((d) => used.add(d.id))
      const sources = [...new Set([...primary.sources, primary.source, ...dups.flatMap((d) => [d.source, ...d.sources])])]
      const fill: Record<string, unknown> = { sources }
      if (!primary.time) fill.time = dups.find((d) => d.time)?.time ?? null
      if (!primary.endTime) fill.endTime = dups.find((d) => d.endTime)?.endTime ?? null
      if (!primary.price) fill.price = dups.find((d) => d.price)?.price ?? null
      const flagged = dups.find((d) => d.status !== 'SCHEDULED')
      if (primary.status === 'SCHEDULED' && flagged) Object.assign(fill, { status: flagged.status, statusSource: flagged.statusSource ?? flagged.source })
      await prisma.event.update({ where: { id: primary.id }, data: fill })
      await prisma.event.updateMany({ where: { id: { in: dups.map((d) => d.id) } }, data: { duplicateOfId: primary.id } })
      merged += dups.length
    }
  }

  // 3) Recurring series: same normalised title + venue + city on 3+ upcoming dates
  const series = await prisma.event.findMany({
    where: { ...upcoming, duplicateOfId: null, seriesKey: { not: null } },
    select: { seriesKey: true, date: true, recurrence: true },
  })
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
  await inBatches(updates, 20, ([key, rec]) => prisma.event.updateMany({ where: { seriesKey: key, ...upcoming }, data: { recurrence: rec } }))

  // 4) Correct dump-bucket suburbs, city-as-venue names, and known category mistags.
  // Organiser edits are left alone. The same rules run at ingest; this catches rows already stored.
  const review = await prisma.event.findMany({
    where: { ...upcoming, duplicateOfId: null, organiserEditedAt: null },
    select: { id: true, title: true, description: true, venueName: true, venueAddress: true, suburb: true, city: true, category: true, subTags: true },
  })
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
  await inBatches(placeUpdates, 20, (u) => prisma.event.update({ where: { id: u.id }, data: u.data }))

  const result = { backfilled: missing.length, merged, recurringSeries: recurring, places, categories }
  console.log('[quality] pass complete', result)
  return result
}
