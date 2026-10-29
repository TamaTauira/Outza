export const dynamic = 'force-dynamic'

import { unstable_cache } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { sydneyToday } from '@/lib/event-store'
import { activeTierMap } from '@/lib/promotions'
import { friendsGoing } from '@/lib/social'
import { getSessionUser } from '@/lib/session'
import { CITY_NAMES, cityDef } from '@/lib/cities'
import { knownCategories, presentListing } from '@/lib/categories'
import { addressInOtherState } from '@/lib/seo'
import { coordsFitCity } from '@/lib/travel'
import { correctPin, placeFromText } from '@/lib/venue-place'
import { confidence } from '@/lib/quality'
import { verifiedFlags } from '@/lib/listing-trust'

const BOARD_SELECT = {
  id: true, title: true, date: true, endDate: true, time: true, endTime: true,
  venueName: true, venueAddress: true, suburb: true, city: true,
  category: true, subTags: true, isLGBTI: true, isFree: true,
  price: true, priceMin: true, priceMax: true, ticketUrl: true, organiserUrl: true,
  latitude: true, longitude: true, status: true, statusSource: true, source: true,
  lastVerifiedAt: true, updatedAt: true, duplicateOfId: true,
} as const

type BoardArgs = {
  page: number
  limit: number
  search: string
  categories: string[]
  subTag: string
  suburb: string
  isFree: boolean
  isLGBTI: boolean
  dateFrom: string
  dateTo: string
  sortBy: string
  city: string
  promoterId: string
}

function boardWhere(a: BoardArgs): Prisma.EventWhereInput {
  const where: Prisma.EventWhereInput = {
    date: { gte: sydneyToday() },
    duplicateOfId: null,
    NOT: { status: 'CANCELLED', statusSource: 'promoter' },
  }
  if (a.city && CITY_NAMES.includes(a.city)) where.city = a.city
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
  if (a.suburb) {
    and.push({
      OR: [
        { suburb: a.suburb },
        { venueAddress: { contains: a.suburb, mode: 'insensitive' } },
        { venueName: { contains: a.suburb, mode: 'insensitive' } },
      ],
    })
  }
  if (a.isFree) {
    and.push({
      OR: [
        { isFree: true },
        { priceMin: { lte: 0 } },
        { price: { contains: 'free', mode: 'insensitive' } },
        { price: { in: ['0', '0.00', '$0', '$0.00'] } },
      ],
    })
    and.push({ OR: [{ priceMin: null }, { priceMin: { lte: 0 } }] })
  }
  if (a.isLGBTI) where.isLGBTI = true
  if (a.dateFrom) where.date = { ...(where.date as object), gte: new Date(a.dateFrom) }
  if (a.dateTo) where.date = { ...(where.date as object), lte: new Date(a.dateTo) }
  if (and.length) where.AND = and
  return where
}

function shapeBoard(events: Prisma.EventGetPayload<{ select: typeof BOARD_SELECT }>[], city: string, categories: string[], suburb: string) {
  let shown = events.map((e) => {
    const listed = presentListing(e)
    const place = placeFromText({ venueAddress: listed.venueAddress, venueName: listed.venueName, suburb: listed.suburb, city: listed.city })
    const pin = correctPin(listed.latitude, listed.longitude, place, listed.city)
    return { ...listed, suburb: place.suburb ?? listed.suburb, latitude: pin.lat, longitude: pin.lng }
  })
  if (city && CITY_NAMES.includes(city)) {
    const def = cityDef(city)
    shown = shown.filter((e) => {
      const blob = [e.venueAddress, e.venueName, e.suburb].filter(Boolean).join(' ')
      if (addressInOtherState(blob, def)) return false
      if (e.latitude != null && e.longitude != null && !coordsFitCity(e.latitude, e.longitude, city)) return false
      return true
    })
  }
  if (categories.length) shown = shown.filter((e) => categories.includes(e.category))
  if (suburb) {
    const want = suburb.toLowerCase()
    shown = shown.filter((e) => (e.suburb ?? '').toLowerCase() === want)
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
  const events = await prisma.event.findMany({ where, orderBy, skip, take: a.limit, select: BOARD_SELECT })
  const shown = shapeBoard(events, a.city, a.categories, a.suburb)
  const fullPage = events.length === a.limit
  const total = fullPage
    ? await prisma.event.count({ where })
    : skip + shown.length
  const [tiers, verified] = await Promise.all([
    activeTierMap(shown.map((e) => e.id)),
    verifiedFlags(shown),
  ])
  return {
    events: shown.map((e) => ({
      ...e,
      date: e.date.toISOString(),
      endDate: e.endDate?.toISOString() ?? null,
      lastVerifiedAt: e.lastVerifiedAt?.toISOString() ?? null,
      updatedAt: e.updatedAt.toISOString(),
      promoTier: tiers[e.id] ?? null,
      confidenceLevel: confidence(e).level,
      verified: verified.get(e.id) ?? false,
    })),
    total: Math.max(0, total),
  }
}

const cachedBoard = unstable_cache(queryBoard, ['board-events-v2'], { revalidate: 30 })

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const page = parseInt(sp.get('page') ?? '1')
    const limit = parseInt(sp.get('limit') ?? '20')
    const search = sp.get('search') ?? ''
    const category = sp.get('category') ?? ''
    const subTag = sp.get('subTag') ?? ''
    const suburb = sp.get('suburb') ?? ''
    const isFree = sp.get('isFree') === 'true'
    const isLGBTI = sp.get('isLGBTI') === 'true'
    const dateFrom = sp.get('dateFrom') ?? ''
    const dateTo = sp.get('dateTo') ?? ''
    const sortBy = sp.get('sortBy') ?? 'date'
    const city = sp.get('city') ?? ''
    const promoterId = sp.get('promoterId') ?? ''

    const categories = knownCategories([...(category ? [category] : []), ...(sp.get('categories') ?? '').split(',')])
    const args: BoardArgs = {
      page: Number.isFinite(page) && page > 0 ? page : 1,
      limit: Math.min(300, Math.max(1, Number.isFinite(limit) ? limit : 20)),
      search: search.slice(0, 120), categories, subTag, suburb, isFree, isLGBTI, dateFrom, dateTo, sortBy, city, promoterId,
    }
    const mePromise = getSessionUser().catch(() => null)
    const board = await cachedBoard(JSON.stringify(args))
    const me = await mePromise
    const ids = board.events.map((e) => e.id)
    const [friends, mine] = await Promise.all([
      me && ids.length ? friendsGoing(me.id, ids) : Promise.resolve({} as Record<string, string[]>),
      me && ids.length ? prisma.attendance.findMany({ where: { userId: me.id, eventId: { in: ids } }, select: { eventId: true } }) : Promise.resolve([]),
    ])
    const going = new Set(mine.map((m) => m.eventId))
    return NextResponse.json({
      events: board.events.map((e) => ({ ...e, friendsGoing: friends[e.id] ?? [], going: going.has(e.id) })),
      total: board.total,
      page: args.page,
      totalPages: Math.max(1, Math.ceil(board.total / args.limit)),
    })
  } catch (err: any) {
    console.error('Error fetching events:', err?.message)
    return NextResponse.json({ events: [], total: 0, page: 1, totalPages: 0 }, { status: 500 })
  }
}
