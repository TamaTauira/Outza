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
import { collapseShowings, hiddenFromPublic, sameShowing } from '@/lib/listing-visibility'
import { correctPin, placeFromText } from '@/lib/venue-place'
import { imageAssetSelect } from '@/lib/images/spec'
import { eventPictureSelect } from '@/lib/images/display-spec'
import { PUBLIC_EVENT_AND, redactCommunityPublic } from '@/lib/community-shared'
import { priceWhere } from '@/lib/ai-search-query'
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
  // yesterday. A future endsAt on its own no longer qualifies a row \u2014 a
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

async function queryBoard(raw: string) {
  const a = JSON.parse(raw) as BoardArgs
  const where = boardWhere(a)
  const orderBy = a.sortBy === 'date'
    ? [{ date: 'asc' as const }, { time: { sort: 'asc' as const, nulls: 'last' as const } }, { title: 'asc' as const }]
    : [{ title: 'asc' as const }]
  const skip = (a.page - 1) * a.limit
  const gathered: ReturnType<typeof shapeBoard> = []
  let scanned = 0
  let fullPage = false
  while (gathered.length < a.limit && scanned < a.limit * 5) {
    const events = await prisma.event.findMany({ where, orderBy, skip: skip + scanned, take: a.limit, select: BOARD_SELECT })
    scanned += events.length
    fullPage = events.length === a.limit
    for (const row of shapeBoard(events, a.city, a.categories, a.suburb, a.isFree, a.maxPrice ?? null)) {
      if (gathered.some((earlier) => earlier.id === row.id || sameShowing(earlier, row))) continue
      gathered.push(row)
      if (gathered.length >= a.limit) break
    }
    if (!fullPage) break
  }
  const shown = gathered.slice(0, a.limit)
  const total = fullPage
    ? await prisma.event.count({ where })
    : skip + shown.length
  const tiers = await activeTierMap(shown.map((e) => e.id))
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
    total: Math.max(0, total),
  }
}

const cachedBoard = unstable_cache(queryBoard, ['board-events-v11'], { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: [PUBLIC_EVENT_TAG] })

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
