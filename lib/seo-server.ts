import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { PUBLIC_EVENT_TAG, PUBLIC_REVALIDATE_SECONDS } from '@/lib/http-cache'
import type { Prisma } from '@prisma/client'
import { isDbSaturation, withStatementTimeout } from '@/lib/db-guard'
import { CITIES, boardCitiesFor, cityDef, type CityDef } from '@/lib/cities'
import { BOARD_SCAN_MAX_RAW, BOARD_SCAN_TAKE } from '@/lib/board-feed'
import { imageAssetSelect, variantUrl, type VariantManifest } from '@/lib/images/spec'
import { eventPictureSelect } from '@/lib/images/display-spec'
import { placeholderAbsolute } from '@/lib/placeholders'
import { presentListing } from '@/lib/categories'
import { stripTrackingParams } from '@/lib/listing-link'
import { evaluateSeasons, type SeasonDecision } from '@/lib/seasons'
import { addDaysKey, addressInOtherState, cityToday, eventPath, isLandingSuburb, isPastEvent, isTonightSlot, namesAnotherTown, slugify, tzOffset, weekendRange, TOPICS, type GuideFact, type TopicDef, type TopicKey, type WhenKey } from '@/lib/seo'
import { ACTIVITY_TOPICS, evaluateGuides, matchesCommunity, matchesGarage, matchesMarketTitle, matchesPopup, matchesTopic, matchesWarehouse, suburbDirectory, whenRange, type GuideDecision, type InvRow } from '@/lib/local-seo'
import { addDaysStr, localDupKey, localPath, occurrences, recurrenceLabel, todayIn } from '@/lib/local-shared'
import { PUBLIC_EVENT_AND } from '@/lib/community-shared'
import { listingBucket, minutesNow, orderedWindow } from '@/lib/listing-window'
import { collapseShowings, hiddenFromPublic } from '@/lib/listing-visibility'

const day = (key: string) => new Date(`${key}T00:00:00.000Z`)

const landingSelect = {
  id: true, title: true, date: true, endDate: true, time: true, endTime: true, venueName: true, venueAddress: true, suburb: true,
  category: true, subTags: true, isLGBTI: true, isFree: true, price: true, priceMin: true, priceMax: true, imageUrl: true, ticketUrl: true, status: true,
  latitude: true, longitude: true, organiserName: true, organiserUrl: true, city: true,
  source: true, sources: true, lastVerifiedAt: true, statusSource: true, duplicateOfId: true,
  ...eventPictureSelect,
  imageAsset: { select: imageAssetSelect },
} satisfies Prisma.EventSelect

export type LandingEvent = Prisma.EventGetPayload<{ select: typeof landingSelect }>

const normTitle = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const ci = (s: string) => ({ title: { contains: s, mode: 'insensitive' as const } })
const POST_FILTER = new Set<TopicKey>(['markets', 'pop-up-sales', 'warehouse-sales', 'garage-sales', 'community-events', 'live-music'])

/** Title-pattern topics need an in-code filter after the DB query, so their totals come from the filtered rows. */
const TOPIC_FILTER: Partial<Record<TopicKey, (e: { title: string; subTags: string[] }) => boolean>> = {
  markets: (e) => matchesMarketTitle(e.title, e.subTags),
  'pop-up-sales': (e) => matchesPopup(e.title),
  'warehouse-sales': (e) => matchesWarehouse(e.title),
  'garage-sales': (e) => matchesGarage(e.title),
  'community-events': (e) => matchesCommunity(e.title),
}

/**
 * Chunked scan of a full matching set, capped the way the board caps its
 * exact gathers (BOARD_SCAN_TAKE / BOARD_SCAN_MAX_RAW from board-feed).
 * A guide total is printed as an exact number, so the scan walks to the
 * end of the set; if the safety cap ever stops it early the caller is
 * told (truncated) instead of the partial count passing as exact.
 */
export async function scanInChunks<T>(fetchChunk: (skip: number, take: number) => Promise<T[]>): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = []
  for (let skip = 0; ; skip += BOARD_SCAN_TAKE) {
    if (skip >= BOARD_SCAN_MAX_RAW) {
      console.error(`[seo] guide scan cap reached (${BOARD_SCAN_MAX_RAW} raw rows); the count is partial`)
      return { rows, truncated: true }
    }
    const take = Math.min(BOARD_SCAN_TAKE, BOARD_SCAN_MAX_RAW - skip)
    const chunk = await fetchChunk(skip, take)
    rows.push(...chunk)
    if (chunk.length < take) return { rows, truncated: false }
  }
}

/**
 * The minimum row shape the guide drops and the showing collapse read.
 * Both guide selects (the landing select and the suburb-count select)
 * satisfy it.
 */
export type LandingShapeRow = {
  title?: string | null
  venueName?: string | null
  venueAddress?: string | null
  suburb?: string | null
  city?: string | null
  date: Date | string
  endDate?: Date | string | null
  time?: string | null
  endTime?: string | null
  endsAt?: Date | string | null
  allDay?: boolean | null
  ticketUrl?: string | null
  source?: string | null
  description?: string | null
}

/**
 * The filter + collapse core every guide surface shapes by, in the
 * guide's own order: drop mis-filed, other-town, past and hidden rows,
 * then collapse duplicate showings (keeping the best-scored copy, as
 * collapseShowings does). shapeLandingEvents presents these rows for a
 * guide list; suburbCountsFromRows counts them per suburb. One core, so
 * a count can never be built on drops the list does not make.
 */
export function shapeLandingRows<T extends LandingShapeRow>(rows: T[], city: CityDef): T[] {
  return collapseShowings(rows.filter((e) => !addressInOtherState(e.venueAddress, city) && !namesAnotherTown(city.name, e) && !isPastEvent(e) && !hiddenFromPublic(e)))
}

/**
 * The guide list's own shaping: the shared core, then present. A guide
 * page's total counts exactly the rows this produces for its where.
 */
export function shapeLandingEvents(rows: LandingEvent[], city: CityDef): LandingEvent[] {
  return shapeLandingRows(rows, city).map((e) => presentListing(e))
}

/**
 * The result every degraded guide read returns — DB saturation, or a
 * gather stopped at the raw-row cap: no events and no total. Every
 * guide surface prints `total` as an exact number whenever it is
 * positive (the GuideLanding headline and mobile count lines, "Showing
 * the next N of TOTAL", the topic page's meta description, the FAQ
 * facts, JSON-LD numberOfItems), and none of them suppress a number on
 * `degraded` alone — the flag only drives the robots decision. So a
 * partial shaped count must never reach those surfaces as `total`:
 * zeroing it here, at the data level, is the one treatment that keeps
 * every surface honest with no rendering or copy change, and it is
 * exactly what the saturation path already renders through all of them.
 */
export function degradedLandingResult(from: string, to: string | null) {
  return { events: [] as LandingEvent[], total: 0, from, to, titles: new Set<string>(), degraded: true }
}

/** Upcoming, non-duplicate, non-cancelled events for a landing page. */
export async function landingEvents(city: CityDef, opts: { topic?: TopicKey; suburb?: string; when?: WhenKey; range?: { from: string; to: string } }, take = 60) {
  const today = cityToday(city)
  let from = today
  let to: string | null = null
  // Region boards read their member cities too: Sydney's guide carries Newcastle-filed events.
  const where: Prisma.EventWhereInput = { city: { in: boardCitiesFor(city.name) }, duplicateOfId: null, status: { not: 'CANCELLED' }, AND: [...PUBLIC_EVENT_AND] }
  if (opts.range) {
    from = opts.range.from
    to = opts.range.to
  } else if (opts.when) ({ from, to } = whenRange(city, opts.when))
  switch (opts.topic) {
    case 'tonight': if (!opts.when) to = today; break
    case 'this-weekend': if (!opts.when) ({ from, to } = weekendRange(city)); break
    case 'free-events': where.isFree = true; break
    case 'live-music': where.category = 'Music'; break
    case 'family': where.category = 'Family'; break
    case 'lgbtiq': where.isLGBTI = true; break
    case 'festivals': where.OR = [{ subTags: { has: 'Festival' } }, ci('festival')]; break
    case 'markets':
      where.category = { not: 'Business' }
      where.OR = [{ subTags: { hasSome: ['Markets', 'Market'] } }, ci('market')]
      break
    case 'pop-up-sales': where.OR = [ci('pop-up'), ci('popup'), ci('pop up')]; break
    case 'warehouse-sales': where.OR = [ci('warehouse'), ci('sample sale'), ci('clearance'), ci('stock sale'), ci('factory sale')]; break
    case 'garage-sales': where.OR = [ci('garage sale'), ci('yard sale'), ci('moving sale'), ci('boot sale')]; break
    case 'community-events': where.OR = [ci('fete'), ci('fundraiser'), ci('swap'), ci('boot sale'), ci('school fair'), ci('street party')]; break
  }
  if (opts.suburb) where.suburb = { equals: opts.suburb, mode: 'insensitive' }
  where.date = to ? { gte: day(from), lte: day(to) } : { gte: day(from), lte: day(addDaysKey(today, 120)) }

  const post = !!(opts.topic && POST_FILTER.has(opts.topic))
  const tonight = opts.when === 'tonight' || (!opts.when && opts.topic === 'tonight')
  try {
    // The total is the shaped count of the whole matching set — never a
    // raw count({ where }) and never the fetched slice. The page prints
    // it as the number of listings for the topic ("Showing the next N of
    // TOTAL", "N upcoming listings for this page"), so the full set is
    // gathered in chunks, the way the board gathers its bounded queries,
    // and shaped by the list's own rules. The id tiebreak keeps chunk
    // boundaries stable, as in board-feed's gather.
    const { rows, truncated } = await scanInChunks((skip, chunkTake) =>
      withStatementTimeout(8_000, (tx) => tx.event.findMany({ where, select: landingSelect, orderBy: [{ date: 'asc' }, { time: 'asc' }, { id: 'asc' }], skip, take: chunkTake })))
    // A capped gather holds only part of the set. Its shaped count is
    // partial, so the read degrades exactly as a saturated one does
    // (degradedLandingResult) instead of printing the partial number
    // as the guide's total.
    if (truncated) return degradedLandingResult(from, to)
    let clean = shapeLandingEvents(rows, city)
    if (post && opts.topic) clean = clean.filter((e) => matchesTopic(e, opts.topic!))
    if (tonight) {
      const tonightWindow = { window: 'tonight' as const, day: today, nowMinutes: minutesNow(city.name), dropEnded: true }
      clean = orderedWindow(clean, tonightWindow).map((e) => ({
        ...e,
        availabilityKind: listingBucket(e, tonightWindow) === 'possibly' ? 'possibly' as const : undefined,
      }))
    }
    const total = clean.length
    const slice = clean.slice(0, take)
    return { events: slice, total, from, to, titles: new Set(clean.map((e) => normTitle(e.title))), degraded: truncated }
  } catch (err) {
    if (!isDbSaturation(err)) throw err
    console.error('landing events skipped, database saturated', city.name, err instanceof Error ? err.message : err)
    return degradedLandingResult(from, to)
  }
}

export type LandingLocal = {
  id: string; title: string; category: string; description: string; suburb: string; address: string; startTime: string; endTime: string
  priceNote: string | null; date: string; schedule: string; recurring: boolean; organiserName: string
}

/** Approved VibePeep Local listings for a topic page: one row per listing (its next date), within 60 days. */
export async function landingLocal(city: CityDef, topic: TopicDef | null, opts: { suburb?: string; from?: string; to?: string; ownOnly?: boolean } = {}): Promise<LandingLocal[]> {
  if (!topic?.local && opts.suburb == null && !opts.from) return []
  const today = todayIn(city.tz)
  const from = opts.from ?? today
  const to = opts.to ?? addDaysStr(today, 60)
  const rows = await withStatementTimeout(8_000, (tx) => tx.localListing.findMany({
    where: { city: { in: boardCitiesFor(city.name) }, status: 'APPROVED', duplicateOfId: null, expiresAt: { gte: new Date() }, ...(opts.ownOnly ? { sourceName: null } : {}), ...(topic?.local ? { category: topic.local } : {}), ...(opts.suburb ? { suburb: { equals: opts.suburb, mode: 'insensitive' } } : {}) },
    select: { id: true, title: true, category: true, description: true, suburb: true, address: true, startDate: true, endDate: true, startTime: true, endTime: true, recurrence: true, recurUntil: true, priceNote: true, organiserName: true },
    take: 400,
  })).catch((err) => {
    if (!isDbSaturation(err)) throw err
    console.error('landing local skipped, database saturated', city.name, err instanceof Error ? err.message : err)
    return []
  })
  const filter = topic && topic.key !== 'markets' ? TOPIC_FILTER[topic.key] : undefined
  const needsFilter = topic?.key === 'pop-up-sales'
  return rows
    .filter((l) => !needsFilter || !filter || filter({ title: `${l.title} ${l.description}`, subTags: [] }))
    .map((l) => ({ l, next: occurrences(l, from, to)[0] }))
    .filter((x) => x.next)
    .map(({ l, next }) => ({ id: l.id, title: l.title, category: l.category, description: l.description, suburb: l.suburb, address: l.address, startTime: l.startTime, endTime: l.endTime, priceNote: l.priceNote, organiserName: l.organiserName, date: next!, schedule: recurrenceLabel(l), recurring: l.recurrence !== 'NONE' }))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    .filter((x, i, all) => all.findIndex((y) => localDupKey({ ...y, city: city.name }) === localDupKey({ ...x, city: city.name }) && y.startTime === x.startTime) === i)
}

export type LandingData = { events: LandingEvent[]; local: LandingLocal[]; total: number; from: string; to: string | null; degraded?: boolean }

/** Everything a city/topic page shows: board events plus matching VibePeep Local listings. */
export const landingData = cache(async function landingData(city: CityDef, topic: TopicDef | null, suburb?: string, take = 60, when?: WhenKey, range?: { from: string; to: string }): Promise<LandingData> {
  const ev = await landingEvents(city, { topic: topic?.key, suburb, when, range }, take)
  const datedTopic = !when && (topic?.key === 'tonight' || topic?.key === 'this-weekend')
  const activity = !!topic && topic.key !== 'events' && topic.key !== 'tonight' && topic.key !== 'this-weekend'
  let raw: LandingLocal[] = []
  if (range && !topic?.local) {
    raw = await landingLocal(city, topic, { from: range.from, to: range.to, ...(suburb ? { suburb } : {}) })
  } else if (topic?.local) {
    raw = await landingLocal(city, topic, {
      ...(suburb ? { suburb } : {}),
      ...(when ? { from: ev.from, to: ev.to ?? ev.from } : {}),
    })
  } else if (!activity && (when || datedTopic)) {
    raw = await landingLocal(city, null, { from: ev.from, to: ev.to ?? ev.from, ownOnly: true, ...(suburb ? { suburb } : {}) })
  } else if (!topic && !when && suburb) {
    // Organiser-submitted sales and gatherings that never arrived via a ticket feed.
    raw = await landingLocal(city, null, { suburb, ownOnly: true, from: ev.from, to: addDaysKey(ev.from, 60) })
  }
  // Imported community listings mirror board events; never show the same thing twice.
  // Tonight uses the same 5pm start rule as the board events above it.
  const night = when === 'tonight' || (!when && topic?.key === 'tonight')
  const local = raw.filter((l) => !ev.titles.has(normTitle(l.title)) && (!night || isTonightSlot(l.startTime, l.endTime)))
  return { events: ev.events, from: ev.from, to: ev.to, local, total: ev.total + local.length, degraded: ev.degraded }
})

const totalsCache = new Map<string, { at: number; n: number }>()

/** Shaped listing total for one city/topic page (cached 10 minutes): the same total the page itself prints, gathered by landingEvents plus the page's own local arm. */
export const topicTotal = cache(async function topicTotal(city: CityDef, topic: TopicDef): Promise<number> {
  const k = `${city.name}|${topic.key}`
  const hit = totalsCache.get(k)
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.n
  const ev = await landingEvents(city, { topic: topic.key }, 1)
  // The local arm counts what the topic page itself lists: landingLocal's
  // next-occurrence, deduped rows, minus any whose title a board event
  // already covers — the same construction landingData totals with, not a
  // raw count of approved listings in the category.
  const local = topic.local
    ? (await landingLocal(city, topic)).filter((l) => !ev.titles.has(normTitle(l.title))).length
    : 0
  const n = ev.total + local
  totalsCache.set(k, { at: Date.now(), n })
  return n
})

/** Listing counts for every topic in a city, in parallel. */
export async function topicTotals(city: CityDef): Promise<Record<TopicKey, number>> {
  const pairs = await Promise.all(TOPICS.map(async (t) => [t.key, await topicTotal(city, t)] as const))
  return Object.fromEntries(pairs) as Record<TopicKey, number>
}

/**
 * Upcoming shaped listing counts per city, for the "other cities" links.
 * Each city's number is its own events guide's total, via topicTotal
 * (which carries the 10-minute totals cache): landingEvents with the
 * events topic already reads the region board's member cities —
 * Newcastle counts towards Sydney — and shapes the set the way the
 * guide list does, so the gate that shows a link can never be passed on
 * rows the destination page would drop or collapse. Two cities at a
 * time, the way loadCityGuideModels walks the catalogue: each count is
 * a full chunked gather, and nine at once would crowd the shared pool.
 */
export const cityEventCounts = cache(async function cityEventCounts(): Promise<Record<string, number>> {
  const eventsTopic = TOPICS.find((t) => t.key === 'events')!
  const out: Record<string, number> = {}
  const pending = [...CITIES]
  const workers = Array.from({ length: Math.min(2, pending.length) }, async () => {
    for (;;) {
      const city = pending.shift()
      if (!city) return
      out[city.name] = await topicTotal(city, eventsTopic)
    }
  })
  await Promise.all(workers)
  return out
})

/** When listings were last refreshed from sources (for visible "updated" lines and dateModified). */
export const lastRefreshAt = cache(async function lastRefreshAt(): Promise<Date | null> {
  const r = await withStatementTimeout(8_000, (tx) => tx.refreshLog.findFirst({ where: { status: 'completed' }, orderBy: { startedAt: 'desc' }, select: { endedAt: true, startedAt: true } })).catch(() => null)
  return r ? r.endedAt ?? r.startedAt : null
})

type SuburbCount = { name: string; slug: string; count: number }

const suburbCountSelect = {
  id: true, title: true, date: true, endDate: true, time: true, endTime: true, endsAt: true, allDay: true,
  venueName: true, venueAddress: true, suburb: true, city: true, ticketUrl: true, source: true, description: true,
} satisfies Prisma.EventSelect

export type SuburbCountRow = Prisma.EventGetPayload<{ select: typeof suburbCountSelect }>

/**
 * Per-suburb counts from shaped rows: the shared shaping core
 * (shapeLandingRows — the same drops and showing collapse the suburb
 * page's own list applies via landingEvents with a suburb), so a
 * suburb's count is the number of listings its page can show — not the
 * number of stored rows carrying the suburb string.
 * Rows group by suburb slug, the way the page resolves its suburb.
 */
export function suburbCountsFromRows(rows: SuburbCountRow[], city: CityDef, min: number): SuburbCount[] {
  const shaped = shapeLandingRows(rows, city)
  const counts = new Map<string, { name: string; count: number }>()
  for (const r of shaped) {
    if (!isLandingSuburb(r.suburb, city)) continue
    const slug = slugify(r.suburb!)
    const cur = counts.get(slug)
    counts.set(slug, { name: cur?.name ?? r.suburb!, count: (cur?.count ?? 0) + 1 })
  }
  return [...counts].filter(([, v]) => v.count >= min).sort((a, b) => b[1].count - a[1].count).map(([slug, v]) => ({ name: v.name, slug, count: v.count }))
}

/**
 * A suburb scan stopped at the raw-row cap. The partial counts are not
 * authoritative, so they must neither be written to the suburbs cache
 * nor served as this call's answer: throwing out of the cached
 * function leaves the stored counts alone (the same reliance
 * cachedGuideModel places on throwing under saturation), and
 * citySuburbs fails safe to the last good counts this process served,
 * or none.
 */
export class SuburbScanTruncatedError extends Error {
  constructor(cityName: string) {
    super(`suburb scan for ${cityName} stopped at the raw-row cap; partial counts discarded`)
    this.name = 'SuburbScanTruncatedError'
  }
}

async function queryCitySuburbs(city: CityDef, today: string, min: number): Promise<SuburbCount[]> {
  const { rows, truncated } = await scanInChunks((skip, take) => withStatementTimeout(8_000, (tx) => tx.event.findMany({
    where: { city: { in: boardCitiesFor(city.name) }, duplicateOfId: null, status: { not: 'CANCELLED' }, date: { gte: day(today), lte: day(addDaysKey(today, 120)) }, suburb: { not: null }, AND: [...PUBLIC_EVENT_AND] },
    select: suburbCountSelect,
    orderBy: [{ date: 'asc' }, { time: 'asc' }, { id: 'asc' }],
    skip,
    take,
  })))
  if (truncated) throw new SuburbScanTruncatedError(city.name)
  return suburbCountsFromRows(rows, city, min)
}

const cachedSuburbs = unstable_cache(
  async (cityName: string, today: string, min: number) => {
    const city = CITIES.find((c) => c.name === cityName)
    if (!city) return [] as SuburbCount[]
    return queryCitySuburbs(city, today, min)
  },
  ['city-suburbs-v1'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: [PUBLIC_EVENT_TAG] },
)

const suburbMemo = new Map<string, SuburbCount[]>()

/** Suburbs in a city with enough upcoming listings to merit their own page. */
export const citySuburbs = cache(async function citySuburbs(city: CityDef, min = 3): Promise<SuburbCount[]> {
  const today = cityToday(city)
  const key = `${city.name}|${today}|${min}`
  try {
    const rows = await cachedSuburbs(city.name, today, min)
    suburbMemo.set(key, rows)
    return rows
  } catch (err) {
    if (err instanceof SuburbScanTruncatedError) {
      console.error('city suburbs skipped, scan truncated', city.name)
      return suburbMemo.get(key) ?? []
    }
    if (!isDbSaturation(err)) throw err
    console.error('city suburbs skipped, database saturated', city.name, err instanceof Error ? err.message : err)
    return suburbMemo.get(key) ?? []
  }
})

export function eventImageUrl(ev: { imageUrl?: string | null; category?: string | null; imageAsset?: { variants?: unknown; status?: string } | null }, origin: string): string {
  const m = ev.imageAsset?.variants as VariantManifest | null | undefined
  const w = m?.sizes?.hero?.at(-1) ?? m?.sizes?.featured?.at(-1)
  if (m && w) {
    const url = variantUrl(m, m.sizes.hero?.length ? 'hero' : 'featured', w, 'webp')
    return url.startsWith('http') ? url : `${origin}${url}`
  }
  if (ev.imageUrl && /^https?:\/\//.test(ev.imageUrl)) return ev.imageUrl
  return placeholderAbsolute(ev.category, 'og', origin)
}

const STATUS_SCHEMA: Record<string, string> = {
  CANCELLED: 'https://schema.org/EventCancelled',
  POSTPONED: 'https://schema.org/EventPostponed',
  RESCHEDULED: 'https://schema.org/EventRescheduled',
}

const iso = (dateKey: string, time: string | null | undefined, tz: string) =>
  time && /^\d{2}:\d{2}/.test(time) ? `${dateKey}T${time.slice(0, 5)}:00${tzOffset(tz, dateKey)}` : dateKey

type JsonLdEvent = {
  id: string; title: string; description?: string | null; date: Date; endDate: Date | null; time: string | null; endTime: string | null
  venueName: string; venueAddress: string | null; suburb: string | null; city: string; latitude: number | null; longitude: number | null
  isFree: boolean; priceMin: number | null; priceMax: number | null; ticketUrl: string | null; status: string
  organiserName: string | null; organiserUrl: string | null; imageUrl: string | null; imageAsset?: { variants?: unknown } | null
  promoter?: { name: string | null; orgName: string | null } | null
}

/**
 * schema.org Event for a genuine upcoming listing. Only states what the source published:
 * no availability claims, offers only when a price was listed, status only as reported.
 */
export function eventJsonLd(ev: JsonLdEvent, origin: string) {
  const city = cityDef(ev.city)
  const startKey = ev.date.toISOString().slice(0, 10)
  let endKey = (ev.endDate ?? ev.date).toISOString().slice(0, 10)
  if (ev.time && ev.endTime && endKey === startKey && ev.endTime.slice(0, 5) < ev.time.slice(0, 5)) {
    endKey = addDaysKey(endKey, 1)
  }
  const image = eventImageUrl(ev, origin)
  const organiser = ev.organiserName || ev.promoter?.orgName || ev.promoter?.name
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: ev.title,
    url: `${origin}${eventPath(ev)}`,
    startDate: iso(startKey, ev.time, city.tz),
    eventStatus: STATUS_SCHEMA[ev.status] ?? 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: ev.venueName,
      address: {
        '@type': 'PostalAddress',
        ...(ev.venueAddress ? { streetAddress: ev.venueAddress } : {}),
        addressLocality: ev.suburb || city.name,
        addressRegion: city.state,
        addressCountry: 'AU',
      },
      ...(ev.latitude != null && ev.longitude != null ? { geo: { '@type': 'GeoCoordinates', latitude: ev.latitude, longitude: ev.longitude } } : {}),
    },
  }
  if (ev.endTime || ev.endDate) ld.endDate = iso(endKey, ev.endTime, city.tz)
  if (ev.description) ld.description = ev.description.slice(0, 500)
  ld.image = [image]
  const organiserPage = ev.organiserUrl ? stripTrackingParams(ev.organiserUrl) : null
  if (organiser) ld.organizer = { '@type': 'Organization', name: organiser, ...(organiserPage ? { url: organiserPage } : {}) }
  if (ev.isFree) ld.isAccessibleForFree = true
  const ticketPage = ev.ticketUrl ? stripTrackingParams(ev.ticketUrl) : null
  if (ticketPage && (ev.isFree || ev.priceMin != null)) {
    const lo = ev.isFree ? 0 : ev.priceMin!
    const hi = ev.isFree ? 0 : ev.priceMax ?? lo
    ld.offers = hi !== lo
      ? { '@type': 'AggregateOffer', url: ticketPage, priceCurrency: 'AUD', lowPrice: lo, highPrice: hi }
      : { '@type': 'Offer', url: ticketPage, priceCurrency: 'AUD', price: lo }
  }
  return ld
}

/** Safe JSON for a <script type="application/ld+json"> tag. */
export const jsonLdString = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c')

function localTopics(l: { category: string; title: string; description: string }): TopicKey[] {
  if (l.category === 'GARAGE') return ['garage-sales']
  if (l.category === 'WAREHOUSE') return ['warehouse-sales']
  if (l.category === 'MARKET') return matchesPopup(`${l.title} ${l.description}`) ? ['markets', 'pop-up-sales'] : ['markets']
  if (l.category === 'COMMUNITY') return ['community-events']
  return []
}

async function queryGuideRows(city: CityDef, today: string): Promise<InvRow[]> {
  const until = addDaysKey(today, 120)
  const localUntil = addDaysKey(today, 60)
  // One connection for both reads. Two parallel checkouts were enough, with the
  // other page queries, to fill the interactive pool of 10.
  const [events, locals] = await withStatementTimeout(8_000, (tx) => Promise.all([
    tx.event.findMany({
      where: { city: { in: boardCitiesFor(city.name) }, duplicateOfId: null, status: { not: 'CANCELLED' }, date: { gte: day(today), lte: day(until) }, AND: [...PUBLIC_EVENT_AND] },
      select: {
        id: true, title: true, date: true, endDate: true, time: true, endTime: true, endsAt: true, venueName: true, venueAddress: true, suburb: true,
        category: true, subTags: true, isFree: true, isLGBTI: true,
      },
    }),
    tx.localListing.findMany({
      where: { city: { in: boardCitiesFor(city.name) }, status: 'APPROVED', duplicateOfId: null, expiresAt: { gte: new Date() } },
      select: { id: true, title: true, description: true, category: true, suburb: true, address: true, startDate: true, endDate: true, startTime: true, endTime: true, recurrence: true, recurUntil: true, sourceName: true },
    }),
  ]))
  const eventRows: InvRow[] = []
  const titles = new Set<string>()
  for (const raw of events) {
    if (addressInOtherState(raw.venueAddress, city) || isPastEvent({ ...raw, city: city.name }) || hiddenFromPublic({ ...raw, city: city.name })) continue
    const shown = presentListing({ ...raw, city: city.name })
    const suburb = raw.suburb?.trim() || null
    titles.add(normTitle(shown.title))
    eventRows.push({
      id: raw.id,
      dates: [raw.date.toISOString().slice(0, 10)],
      time: raw.time,
      endTime: raw.endTime,
      suburb,
      suburbSlug: suburb && isLandingSuburb(suburb, city) ? slugify(suburb) : null,
      source: 'event',
      topics: ACTIVITY_TOPICS.map((t) => t.key).filter((key) => matchesTopic(shown, key)),
      organiserSubmitted: false,
    })
  }
  const localRows: InvRow[] = []
  for (const l of locals) {
    if (addressInOtherState(l.address, city) || titles.has(normTitle(l.title))) continue
    const dates = occurrences(l, today, localUntil)
    if (!dates.length) continue
    const suburb = l.suburb?.trim() || null
    localRows.push({
      id: `local-${l.id}`,
      dates,
      time: l.startTime,
      endTime: l.endTime,
      suburb,
      suburbSlug: suburb && isLandingSuburb(suburb, city) ? slugify(suburb) : null,
      source: 'local',
      topics: localTopics(l),
      organiserSubmitted: !l.sourceName,
    })
  }
  return [...eventRows, ...localRows]
}

/** Next.js refuses to store an unstable_cache value over 2MB. Sydney's raw inventory was 2.3MB, so every guide URL missed. */
export const GUIDE_CACHE_BYTES = 1_500_000

type CachedGuide = { decisions: GuideDecision[]; suburbs: { name: string; slug: string; count: number }[]; seasons: SeasonDecision[] }

/**
 * The data cache stores this value. Raw inventory rows do not fit. Decisions do.
 * A city with a very wide suburb × activity matrix drops the non-indexed combos
 * so the store still succeeds and the next request does not scan the table again.
 */
export function guideModelForCache(model: CachedGuide): CachedGuide {
  const packed = (decisions: GuideDecision[]): CachedGuide => ({ decisions, suburbs: model.suburbs, seasons: model.seasons })
  const full = packed(model.decisions)
  if (JSON.stringify(full).length <= GUIDE_CACHE_BYTES) return full
  const indexed = model.decisions.filter((d) => d.index || d.reason === 'near-duplicate' || d.kind === 'city-topic' || d.kind === 'suburb')
  const trimmed = packed(indexed)
  if (JSON.stringify(trimmed).length <= GUIDE_CACHE_BYTES) {
    console.warn('[seo] guide model trimmed to indexed guides', { from: model.decisions.length, kept: indexed.length })
    return trimmed
  }
  const primary = model.decisions.filter((d) => d.index || d.kind === 'city-topic')
  console.warn('[seo] guide model trimmed to primary guides', { from: model.decisions.length, kept: primary.length })
  return packed(primary)
}

const guideMemory = new Map<string, CachedGuide>()

const cachedGuideModel = unstable_cache(
  async (cityName: string, today: string): Promise<CachedGuide> => {
    const city = CITIES.find((c) => c.name === cityName)
    if (!city) return { decisions: [], suburbs: [], seasons: [] }
    const memoryKey = `${cityName}|${today}`
    try {
      const rows = await queryGuideRows(city, today)
      const model = guideModelForCache({
        decisions: evaluateGuides(city, rows),
        suburbs: suburbDirectory(city, rows),
        seasons: evaluateSeasons(city, rows),
      })
      guideMemory.set(memoryKey, model)
      return model
    } catch (err) {
      if (!isDbSaturation(err)) throw err
      const kept = guideMemory.get(memoryKey)
      console.warn('[seo] guide model revalidation skipped, database saturated', cityName, err instanceof Error ? err.message : err)
      if (kept) return kept
      // Nothing in this process. Throwing leaves the stored model alone, so the
      // page keeps that copy instead of caching an empty guide.
      throw err
    }
  },
  ['guide-model-v4'],
  // Not on the public event tag. Refresh busts that tag while it is still
  // writing, and rebuilding every city model in that window is what timed out.
  // The model still refreshes on the same 10 minute window as the other public pages.
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

export interface CityGuideModel {
  ok: boolean
  decisions: GuideDecision[]
  suburbs: { name: string; slug: string; count: number }[]
  seasons: SeasonDecision[]
}

const modelCache = new Map<string, { at: number; model: CityGuideModel }>()
const modelInflight = new Map<string, Promise<CityGuideModel>>()

async function loadCityGuideModel(city: CityDef): Promise<CityGuideModel> {
  const today = cityToday(city)
  const key = `${city.name}|${today}`
  const hit = modelCache.get(key)
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.model
  const pending = modelInflight.get(key)
  if (pending) return pending
  const job = (async (): Promise<CityGuideModel> => {
    try {
      const cached = await cachedGuideModel(city.name, today)
      const model: CityGuideModel = { ok: true, decisions: cached.decisions, suburbs: cached.suburbs, seasons: cached.seasons }
      guideMemory.set(key, cached)
      modelCache.set(key, { at: Date.now(), model })
      return model
    } catch (err) {
      const stale = modelCache.get(key)?.model
      if (isDbSaturation(err)) {
        console.warn('guide inventory kept the previous model, database saturated', city.name, err instanceof Error ? err.message : err)
        if (stale?.ok) return stale
        const remembered = guideMemory.get(key)
        if (remembered) return { ok: true, decisions: remembered.decisions, suburbs: remembered.suburbs, seasons: remembered.seasons }
        return { ok: false, decisions: [], suburbs: [], seasons: [] }
      }
      console.error('guide inventory failed', city.name, err)
      return { ok: false, decisions: [], suburbs: [], seasons: [] }
    }
  })()
  modelInflight.set(key, job)
  try {
    return await job
  } finally {
    modelInflight.delete(key)
  }
}

/** Cached inventory gates for one city. `ok: false` means the count could not be loaded. */
export const cityGuideModel = cache(loadCityGuideModel)

/**
 * Every city's guide model, two at a time. A season or editorial page used to
 * start all ten at once. Each cold model is a full-city read, and ten of those
 * filled the connection pool on their own.
 */
export async function loadCityGuideModels(): Promise<{ city: CityDef; model: CityGuideModel }[]> {
  const pending = [...CITIES]
  const found = new Map<string, CityGuideModel>()
  const workers = Array.from({ length: Math.min(2, pending.length) }, async () => {
    for (;;) {
      const city = pending.shift()
      if (!city) return
      found.set(city.name, await cityGuideModel(city))
    }
  })
  await Promise.all(workers)
  return CITIES.map((city) => ({ city, model: found.get(city.name) ?? { ok: false, decisions: [], suburbs: [], seasons: [] } }))
}

function withoutContext(node: Record<string, unknown>) {
  const rest = { ...node }
  delete rest['@context']
  return rest
}

/**
 * ItemList of real Event entities for a guide. Only listings passed in are described.
 */
export function guideStructuredData(input: {
  origin: string
  path: string
  heading: string
  description: string
  city: CityDef
  crumbs: { name: string; url: string }[]
  events: LandingEvent[]
  local: LandingLocal[]
  total: number
  refreshed: Date | null
  facts: GuideFact[]
}) {
  const items = [
    ...input.events.slice(0, 24).map((e) => withoutContext(eventJsonLd({ ...e, city: e.city || input.city.name }, input.origin))),
    ...input.local.slice(0, 12).map((l) => {
      const start = l.startTime && /^\d{2}:\d{2}/.test(l.startTime) ? `${l.date}T${l.startTime.slice(0, 5)}:00${tzOffset(input.city.tz, l.date)}` : l.date
      return {
        '@type': 'Event',
        name: l.title,
        url: `${input.origin}${localPath(l, l.date)}`,
        startDate: start,
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: {
          '@type': 'Place',
          name: l.suburb,
          address: { '@type': 'PostalAddress', streetAddress: l.address, addressLocality: l.suburb, addressRegion: input.city.state, addressCountry: 'AU' },
        },
        ...(l.description ? { description: l.description.slice(0, 500) } : {}),
        ...(l.organiserName ? { organizer: { '@type': 'Organization', name: l.organiserName } } : {}),
        ...(l.endTime && /^\d{2}:\d{2}/.test(l.endTime) ? { endDate: `${l.date}T${l.endTime.slice(0, 5)}:00${tzOffset(input.city.tz, l.date)}` } : {}),
      }
    }),
  ]
  return [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: input.crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })) },
    {
      '@context': 'https://schema.org', '@type': 'CollectionPage', name: input.heading, url: `${input.origin}${input.path}`, description: input.description, inLanguage: 'en-AU',
      ...(input.refreshed ? { dateModified: input.refreshed.toISOString() } : {}),
      about: { '@type': 'City', name: input.city.name, containedInPlace: { '@type': 'Country', name: 'Australia' } },
      ...(items.length ? { mainEntity: { '@type': 'ItemList', name: input.heading, numberOfItems: input.total, itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, item })) } } : {}),
    },
    ...(input.facts.length ? [{
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: input.facts.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
    }] : []),
  ]
}
