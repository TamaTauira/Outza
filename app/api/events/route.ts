export const dynamic = 'force-dynamic'

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
import { imageAssetSelect } from '@/lib/images/spec'
import { confidence } from '@/lib/quality'
import { verifiedFlags } from '@/lib/listing-trust'

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

    const where: Prisma.EventWhereInput = {
      date: { gte: sydneyToday() },
      duplicateOfId: null,
      NOT: { status: 'CANCELLED', statusSource: 'promoter' },
    }

    if (city && CITY_NAMES.includes(city)) where.city = city
    if (promoterId) where.promoterId = promoterId

    if (search) {
      const words = search.split(/\s+/).map((w) => w.trim()).filter((w) => w.length > 1).slice(0, 6)
      const clauses = words.map((w) => ({
        OR: [
          { title: { contains: w, mode: 'insensitive' as const } },
          { venueName: { contains: w, mode: 'insensitive' as const } },
          { description: { contains: w, mode: 'insensitive' as const } },
          { suburb: { contains: w, mode: 'insensitive' as const } },
          { venueAddress: { contains: w, mode: 'insensitive' as const } },
        ],
      }))
      const extra = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []
      where.AND = [...extra, ...clauses]
    }

    const categories = knownCategories([...(category ? [category] : []), ...(sp.get('categories') ?? '').split(',')])
    if (categories.length) where.category = { in: categories }

    if (subTag) {
      where.subTags = { has: subTag }
    }

    if (suburb) {
      // Stored suburb can still say CBD for a Coogee address until the next refresh.
      // Match the address and venue too, then keep rows whose corrected suburb is the one asked for.
      const suburbMatch: Prisma.EventWhereInput = {
        OR: [
          { suburb },
          { venueAddress: { contains: suburb, mode: 'insensitive' } },
          { venueName: { contains: suburb, mode: 'insensitive' } },
        ],
      }
      const extra = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []
      where.AND = [...extra, suburbMatch]
    }

    if (isFree) {
      const extra = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []
      where.AND = [
        ...extra,
        {
          OR: [
            { isFree: true },
            { priceMin: { lte: 0 } },
            { price: { contains: 'free', mode: 'insensitive' } },
            { price: { in: ['0', '0.00', '$0', '$0.00'] } },
          ],
        },
        { OR: [{ priceMin: null }, { priceMin: { lte: 0 } }] },
      ]
    }

    if (isLGBTI) {
      where.isLGBTI = true
    }

    if (dateFrom) {
      where.date = { ...(where.date as any), gte: new Date(dateFrom) }
    }

    if (dateTo) {
      where.date = { ...(where.date as any), lte: new Date(dateTo) }
    }

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy:
          sortBy === 'date'
            ? [{ date: 'asc' }, { time: { sort: 'asc', nulls: 'last' } }, { title: 'asc' }]
            : { title: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { imageAsset: { select: imageAssetSelect } },
      }),
      prisma.event.count({ where }),
    ])

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
    const dropped = events.length - shown.length

    const ids = shown.map((e) => e.id)
    const me = await getSessionUser().catch(() => null)
    const [tiers, friends, mine, verified] = await Promise.all([
      activeTierMap(ids),
      me ? friendsGoing(me.id, ids) : Promise.resolve({} as Record<string, string[]>),
      me && ids.length ? prisma.attendance.findMany({ where: { userId: me.id, eventId: { in: ids } }, select: { eventId: true } }) : Promise.resolve([]),
      verifiedFlags(shown),
    ])
    const going = new Set(mine.map((m) => m.eventId))

    return NextResponse.json({
      events: shown.map((e) => ({
        ...e,
        promoTier: tiers[e.id] ?? null,
        friendsGoing: friends[e.id] ?? [],
        going: going.has(e.id),
        confidenceLevel: confidence(e).level,
        verified: verified.get(e.id) ?? false,
      })),
      total: Math.max(0, total - dropped),
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (err: any) {
    console.error('Error fetching events:', err?.message)
    return NextResponse.json({ events: [], total: 0, page: 1, totalPages: 0 }, { status: 500 })
  }
}
