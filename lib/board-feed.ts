import { unstable_cache } from 'next/cache'
import { PUBLIC_EVENT_TAG, PUBLIC_REVALIDATE_SECONDS } from '@/lib/http-cache'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { sydneyToday } from '@/lib/event-store'
import { activeTierMap } from '@/lib/promotions'
import { CITY_NAMES, boardCitiesFor, cityDef } from '@/lib/cities'
import { areaGroupFor, knownCategories, matchesAreaGroup, presentListing } from '@/lib/categories'
import { addressInOtherState, isPastEvent, namesAnotherTown } from '@/lib/seo'
import { coordsFitCity } from '@/lib/travel'
import { collapseShowings, hiddenFromPublic, sameShowing, type PublicSession } from '@/lib/listing-visibility'
import { correctPin, placeFromText } from '@/lib/venue-place'
import { imageAssetSelect } from '@/lib/images/spec'
import { eventPictureSelect } from '@/lib/images/display-spec'
import { PUBLIC_EVENT_AND, redactCommunityPublic } from '@/lib/community-shared'
import { priceWhere } from '@/lib/ai-search-query'
import { dateKeyOf, liveStatus, minutesOf } from '@/lib/listing-window'
import { toSydneyParts } from '@/lib/event-store-parts'
import { isPaidListing } from '@/lib/quality'

export const BOARD_SELECT = {
  id: true, title: true, date: true, endDate: true, time: true, endTime: true,
  allDay: true, startsAt: true, endsAt: true,
  venueName: true, venueAddress: true, suburb: true, city: true,
  category: true, subTags: true, isLGBTI: true, isFree: true,
  price: true, priceMin: true, priceMax: true, ticketUrl: true, sourceUrl: true, organiserUrl: true,
  imageUrl: true, ...eventPictureSelect, latitude: true, longitude: true, status: true, statusSource: true, source: true,
  lastVerifiedAt: true, updatedAt: true, duplicateOfId: true,
  communityKey: true, locationVisibility: true, childrenInImage: true, imageKidSafe: true,
  imageAsset: { select: imageAssetSelect },
} as const

export type BoardArgs = {
  page: number
  limit: number
  search: string
  categories: string[]
  subTag: string
  suburb: string
  isFree: boolean
  maxPrice?: number | null
  isLGBTI: boolean
  dateFrom: string
  dateTo: string
  timeFrom?: string
  sortBy: string
  city: string
  promoterId: string
}

export function boardWhere(a: BoardArgs): Prisma.EventWhereInput {
  const where: Prisma.EventWhereInput = {
    duplicateOfId: null,
    deletedAt: null,
    status: { not: 'CANCELLED' },
  }
  const actMisfile: Prisma.EventWhereInput = {
    OR: [
      { suburb: { contains: 'Austl', mode: 'insensitive' } },
      { venueName: { contains: 'Austl', mode: 'insensitive' } },
      { venueAddress: { contains: 'Austl', mode: 'insensitive' } },
      { suburb: { contains: 'Australian Capital Territory', mode: 'insensitive' } },
      { venueAddress: { contains: 'Australian Capital Territory', mode: 'insensitive' } },
    ],
  }
  if (a.city === 'Canberra') {
    where.OR = [{ city: 'Canberra' }, { AND: [{ city: 'Sydney' }, actMisfile] }]
  } else if (a.city && CITY_NAMES.includes(a.city)) {
    // A region board (Sydney, the NSW Coast) also carries its member cities'
    // events — Newcastle files under its own name but shows here.
    const members = boardCitiesFor(a.city)
    if (members.length > 1) where.OR = members.map((name) => ({ city: name }))
    else where.city = a.city
    if (a.city === 'Sydney') where.NOT = actMisfile
  }
  if (a.promoterId) where.promoterId = a.promoterId
  const and: Prisma.EventWhereInput[] = []
  if (a.search) {
    const words = a.search.split(/\s+/).map((w) => w.trim()).filter((w) => w.length > 1).slice(0, 6)
    for (const w of words) {
      and.push({
        OR: [
          { title: { contains: w, mode: 'insensitive' } },
          { venueName: { contains: w, mode: 'insensitive' } },
          { suburb: { contains: w, mode: 'insensitive' } },
          { venueAddress: { contains: w, mode: 'insensitive' } },
        ],
      })
    }
  }
  if (a.categories.length) where.category = { in: a.categories }
  if (a.subTag) where.subTags = { has: a.subTag }
  // An area group label is a location predicate, not a suburb string. The folded-in
  // groups narrow in SQL by filed city and suburb so a full page of them can be
  // gathered; shapeBoard still applies the full predicate (pins included). The
  // home group is what is left over, so it cannot narrow and is shaped only.
  const areaGroup = a.suburb ? areaGroupFor(a.city, a.suburb) : undefined
  if (a.suburb && !areaGroup) {
    and.push({
      OR: [
        { suburb: a.suburb },
        { venueAddress: { contains: a.suburb, mode: 'insensitive' } },
        { venueName: { contains: a.suburb, mode: 'insensitive' } },
      ],
    })
  } else if (areaGroup && !areaGroup.storedCities.includes(a.city)) {
    const or: Prisma.EventWhereInput[] = []
    if (areaGroup.storedCities.length) or.push({ city: { in: areaGroup.storedCities } })
    if (areaGroup.suburbs.length) or.push({ suburb: { in: areaGroup.suburbs, mode: 'insensitive' } })
    if (or.length) and.push({ OR: or })
  }
  const price = priceWhere({ isFree: a.isFree, maxPrice: a.maxPrice ?? null })
  if (price) and.push(price)
  and.push(...PUBLIC_EVENT_AND)
  // Today's listings, plus anything still inside its own calendar span: a
  // multi-day endDate still to run, or an after-midnight finish from
  // yesterday. A future endsAt on its own no longer qualifies a row — a
  // linked donor can recompute endsAt from its own endDate, so the span is
  // what bounds this branch (isPastEvent applies the same rule in shapeBoard).
  const today = sydneyToday()
  const yesterday = new Date(today.getTime() - 86_400_000)
  and.push({
    OR: [
      { date: { gte: today }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
      {
        endsAt: { gt: new Date() },
        OR: [{ endDate: { gte: today } }, { endDate: null, date: { gte: yesterday } }],
      },
    ],
  })
  if (a.isLGBTI) where.isLGBTI = true
  if (a.dateFrom) and.push({ date: { gte: new Date(a.dateFrom) } })
  if (a.dateTo) and.push({ date: { lte: new Date(a.dateTo) } })
  if (a.timeFrom && /^\d{2}:\d{2}$/.test(a.timeFrom)) and.push({ time: { gte: a.timeFrom } })
  if (and.length) where.AND = and
  return where
}

function shapeBoard(events: Prisma.EventGetPayload<{ select: typeof BOARD_SELECT }>[], city: string, categories: string[], suburb: string, isFree = false, maxPrice: number | null = null) {
  let shown = events.map((e) => {
    const opened = redactCommunityPublic(e)
    if (!opened.imageUrl) opened.imageAsset = null
    const listed = presentListing(opened)
    const place = placeFromText({ venueAddress: listed.venueAddress, venueName: listed.venueName, suburb: listed.suburb, city: listed.city })
    const hidePin = !!listed.communityKey && listed.locationVisibility !== 'PRECISE'
    const pin = hidePin ? { lat: null, lng: null } : correctPin(listed.latitude, listed.longitude, place, listed.city)
    return { ...listed, suburb: place.suburb ?? listed.suburb, latitude: pin.lat, longitude: pin.lng }
  })
  if (city && CITY_NAMES.includes(city)) {
    const def = cityDef(city)
    shown = shown.filter((e) => {
      if (isPastEvent(e) || hiddenFromPublic(e)) return false
      const blob = [e.venueAddress, e.venueName, e.suburb].filter(Boolean).join(' ')
      if (addressInOtherState(blob, def) || namesAnotherTown(city, e)) return false
      // A region member's event is measured against its own city, not the board's:
      // a Newcastle pin is 117km from Sydney but right at home in Newcastle.
      const home = e.city && boardCitiesFor(city).includes(e.city) ? e.city : city
      if (e.latitude != null && e.longitude != null && !coordsFitCity(e.latitude, e.longitude, home)) return false
      return true
    })
  } else {
    shown = shown.filter((e) => !isPastEvent(e) && !hiddenFromPublic(e))
  }
  shown = collapseShowings(shown)
  if (categories.length) shown = shown.filter((e) => categories.includes(e.category))
  if (suburb) {
    const group = areaGroupFor(city, suburb)
    if (group) {
      shown = shown.filter((e) => matchesAreaGroup(e, city, group))
    } else {
      const want = suburb.toLowerCase()
      shown = shown.filter((e) => (e.suburb ?? '').toLowerCase() === want)
    }
  }
  if (isFree) shown = shown.filter((e) => !isPaidListing(e))
  if (maxPrice != null) {
    shown = shown.filter((e) => {
      if (e.isFree) return !isPaidListing(e)
      return typeof e.priceMin === 'number' && e.priceMin <= maxPrice
    })
  }
  return shown
}

type ShapedRow = ReturnType<typeof shapeBoard>[number]

/** A shaped row as the gather dedupe sees it: an id plus the session fields sameShowing reads. */
type ShowingRow = PublicSession & { id: string; date: Date }

const SHOWING_BLOCK_MINUTES = 45

function startMinutes(time?: string | null): number | null {
  const match = time?.match(/^(\d{1,2}):(\d{2})/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

/**
 * Accumulates the shaped rows of one board query, dropping a row when an
 * already-kept row is the same showing (or carries the same id). Kept rows
 * are bucketed by session day and 45-minute start block — the exact
 * preconditions sameShowing itself checks (same day; starts within 45
 * minutes unless one side is untimed) — so every pair sameShowing could
 * join is compared, and no other pair needs to be.
 */
export interface BoardGather<T extends ShowingRow> {
  rows: T[]
  ids: Set<string>
  days: Map<string, { blocks: Map<number, T[]>; untimed: T[] }>
}

export function newBoardGather<T extends ShowingRow>(): BoardGather<T> {
  return { rows: [], ids: new Set(), days: new Map() }
}

/** Adds one shaped row to the gather. Returns false when it copies a kept row. */
export function gatherShapedRow<T extends ShowingRow>(gather: BoardGather<T>, row: T): boolean {
  if (gather.ids.has(row.id)) return false
  const day = row.date.toISOString().slice(0, 10)
  let bucket = gather.days.get(day)
  if (!bucket) {
    bucket = { blocks: new Map(), untimed: [] }
    gather.days.set(day, bucket)
  }
  const start = startMinutes(row.time)
  const candidates: T[] = [...bucket.untimed]
  if (start == null) {
    for (const rows of bucket.blocks.values()) candidates.push(...rows)
  } else {
    const block = Math.floor(start / SHOWING_BLOCK_MINUTES)
    for (const b of [block - 1, block, block + 1]) candidates.push(...(bucket.blocks.get(b) ?? []))
  }
  if (candidates.some((earlier) => sameShowing(earlier, row))) return false
  gather.ids.add(row.id)
  if (start == null) bucket.untimed.push(row)
  else {
    const block = Math.floor(start / SHOWING_BLOCK_MINUTES)
    const rows = bucket.blocks.get(block) ?? []
    rows.push(row)
    bucket.blocks.set(block, rows)
  }
  gather.rows.push(row)
  return true
}

// How a board query scans its matching set. The board itself (EventList
// and the server seed) always asks for a bounded date span, and its total
// must be exact — the count line, totalPages and "Show N more" all print
// it — so a bounded query always gathers the full shaped sequence. A
// query with no date bound can match the whole future catalogue (the
// homepage search suggestions ask for a search word with no dates at
// all), and gathering all of it to serve a six-row page is a ~400x
// row-volume regression on a shared 25-connection database. So an
// unbounded query only gathers exactly when the raw matching set is
// small; above the threshold it gathers just the requested page plus
// one lookahead row, and its total is then a lower bound, flagged as
// such (totalExact: false) rather than passed off as an exact count.
// No surface that prints the total as an exact number uses an unbounded
// query: EventList and the seed are always date-bounded, and the search
// page prints events.length, not the feed total.
export const BOARD_EXACT_RAW_THRESHOLD = 2000
const BOARD_SCAN_TAKE = 300
// Safety valves, not silent truncations: if a scan ever reaches one,
// the pass stops, logs, and flags the result (scanTruncated) so the
// total is never presented as exact when it is partial.
const BOARD_SCAN_MAX_RAW = 60_000
const PAGE_SCAN_MAX_RAW = 12_000

export interface BoardScanPlan {
  mode: 'exact' | 'page'
  /** Shaped rows the gather needs before it may stop (page mode only). */
  needed: number
  /** skip + limit: the last row index the requested page slices. */
  pageEnd: number
  maxRaw: number
  take: number
}

export function boardScanPlan(a: BoardArgs, rawCount: number | null): BoardScanPlan {
  const skip = (a.page - 1) * a.limit
  const take = Math.max(BOARD_SCAN_TAKE, a.limit)
  if ((a.dateFrom && a.dateTo) || (rawCount != null && rawCount <= BOARD_EXACT_RAW_THRESHOLD)) {
    return { mode: 'exact', needed: Number.POSITIVE_INFINITY, pageEnd: skip + a.limit, maxRaw: BOARD_SCAN_MAX_RAW, take }
  }
  return { mode: 'page', needed: skip + a.limit + 1, pageEnd: skip + a.limit, maxRaw: PAGE_SCAN_MAX_RAW, take }
}

export interface BoardGatherOutcome<T> {
  rows: T[]
  scanned: number
  /** The raw scan ran to the end of the matching set. */
  exhausted: boolean
  /** A safety cap stopped the scan early; the total is partial. */
  scanTruncated: boolean
  /** rows.length is the exact shaped count of the whole matching set. */
  totalExact: boolean
  hasMore: boolean
}

/**
 * Walks the matching set in chunks, shaping and deduping as it goes.
 * Exact mode walks to the end; page mode stops once the requested page
 * (plus one lookahead row, so hasMore is known) is gathered.
 */
export async function gatherBoardRows<T extends ShowingRow>(
  fetchChunk: (skip: number, take: number) => Promise<unknown[]>,
  shape: (rows: never[]) => T[],
  plan: BoardScanPlan,
): Promise<BoardGatherOutcome<T>> {
  const gather = newBoardGather<T>()
  let scanned = 0
  let exhausted = false
  let scanTruncated = false
  for (;;) {
    if (scanned >= plan.maxRaw) {
      scanTruncated = true
      console.error(`[board-feed] scan cap reached (${plan.maxRaw} raw rows, mode ${plan.mode}); total is partial`)
      break
    }
    const take = Math.min(plan.take, plan.maxRaw - scanned)
    const events = await fetchChunk(scanned, take)
    scanned += events.length
    for (const row of shape(events as never[])) gatherShapedRow(gather, row)
    if (events.length < take) { exhausted = true; break }
    if (plan.mode === 'page' && gather.rows.length >= plan.needed) break
  }
  return {
    rows: gather.rows,
    scanned,
    exhausted,
    scanTruncated,
    totalExact: exhausted && !scanTruncated,
    hasMore: gather.rows.length > plan.pageEnd,
  }
}

/**
 * How many of the gathered rows are already over, by the same status
 * rule the list renders with (liveStatus on the row's board day: the
 * span's single day, or the row's own date on a spanning board). The
 * board's stated count is total - endedTotal while ended rows are
 * hidden, so the number is a property of the full set — never of the
 * pages loaded so far (E2E-17). It is computed when the feed is, so it
 * shares the feed's cache freshness, exactly like the total itself.
 */
export function boardEndedCount(
  rows: readonly { date: Date | string; time?: string | null; endTime?: string | null; allDay?: boolean | null; startsAt?: Date | string | null; endsAt?: Date | string | null; endDate?: Date | string | null; city?: string | null; status?: string | null }[],
  span: { dateFrom: string; dateTo: string },
  today: string,
  nowMinutes: number,
): number {
  const singleDay = !!span.dateFrom && span.dateFrom === span.dateTo
  let ended = 0
  for (const row of rows) {
    const day = singleDay ? span.dateFrom : dateKeyOf(row.date)
    if (!day) continue
    if (liveStatus(row, day, today, nowMinutes).tone === 'done') ended++
  }
  return ended
}

async function queryBoard(raw: string) {
  const a = JSON.parse(raw) as BoardArgs
  const where = boardWhere(a)
  // The id tiebreak keeps chunk boundaries stable: without a unique final
  // key, rows tied on date/time/title can swap chunks between the queries
  // of one gather and be counted twice or skipped.
  const orderBy = a.sortBy === 'date'
    ? [{ date: 'asc' as const }, { time: { sort: 'asc' as const, nulls: 'last' as const } }, { title: 'asc' as const }, { id: 'asc' as const }]
    : [{ title: 'asc' as const }, { id: 'asc' as const }]
  const skip = (a.page - 1) * a.limit
  // Only an unbounded query pays for a raw count, and only to choose its
  // scan plan; a bounded board query gathers exactly either way.
  const rawCount = a.dateFrom && a.dateTo ? null : await prisma.event.count({ where })
  const plan = boardScanPlan(a, rawCount)
  const outcome = await gatherBoardRows<ShapedRow>(
    (chunkSkip, chunkTake) => prisma.event.findMany({ where, orderBy, skip: chunkSkip, take: chunkTake, select: BOARD_SELECT }),
    (events) => shapeBoard(events, a.city, a.categories, a.suburb, a.isFree, a.maxPrice ?? null),
    plan,
  )
  const shown = outcome.rows.slice(skip, skip + a.limit)
  const tiers = await activeTierMap(shown.map((e) => e.id))
  const nowParts = toSydneyParts(new Date())
  const endedTotal = boardEndedCount(outcome.rows, a, nowParts.date, minutesOf(nowParts.time) ?? 0)
  return {
    events: shown.map((e) => ({
      ...e,
      date: e.date.toISOString(),
      endDate: e.endDate?.toISOString() ?? null,
      startsAt: e.startsAt?.toISOString() ?? null,
      endsAt: e.endsAt?.toISOString() ?? null,
      lastVerifiedAt: e.lastVerifiedAt?.toISOString() ?? null,
      updatedAt: e.updatedAt.toISOString(),
      promoTier: tiers[e.id] ?? null,
      friendsGoing: [] as string[],
      going: false,
    })),
    // The exact shaped count when the scan ran to the end of the set.
    // In page mode (or past a safety cap) this is the number of rows
    // gathered so far — a lower bound, and totalExact says so.
    total: outcome.rows.length,
    totalExact: outcome.totalExact,
    scanTruncated: outcome.scanTruncated,
    hasMore: outcome.hasMore,
    endedTotal,
  }
}

const cachedBoard = unstable_cache(queryBoard, ['board-events-v12'], { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: [PUBLIC_EVENT_TAG] })

export type BoardFeed = Awaited<ReturnType<typeof queryBoard>>

/** Public board page. Cached for a minute; the caller adds the signed-in visitor's flags. */
export function getBoardFeed(args: BoardArgs): Promise<BoardFeed> {
  return cachedBoard(JSON.stringify(args))
}

export function boardArgsFromSearch(sp: URLSearchParams): BoardArgs {
  const page = parseInt(sp.get('page') ?? '1')
  const limit = parseInt(sp.get('limit') ?? '20')
  const categories = knownCategories([...(sp.get('category') ? [sp.get('category')!] : []), ...(sp.get('categories') ?? '').split(',')])
  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    limit: Math.min(300, Math.max(1, Number.isFinite(limit) ? limit : 20)),
    search: (sp.get('search') ?? '').slice(0, 120),
    categories,
    subTag: sp.get('subTag') ?? '',
    suburb: sp.get('suburb') ?? '',
    isFree: sp.get('isFree') === 'true',
    isLGBTI: sp.get('isLGBTI') === 'true',
    dateFrom: sp.get('dateFrom') ?? '',
    dateTo: sp.get('dateTo') ?? '',
    timeFrom: sp.get('timeFrom') ?? '',
    sortBy: sp.get('sortBy') ?? 'date',
    city: sp.get('city') ?? '',
    promoterId: sp.get('promoterId') ?? '',
  }
}
