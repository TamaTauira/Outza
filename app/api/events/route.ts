export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { sydneyToday } from '@/lib/event-store'
import { activeTierMap } from '@/lib/promotions'
import { friendsGoing } from '@/lib/social'
import { getSessionUser } from '@/lib/session'
import { CITY_NAMES } from '@/lib/cities'
import { imageAssetSelect } from '@/lib/images/spec'
import { confidence } from '@/lib/quality'

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
    }

    if (city && CITY_NAMES.includes(city)) where.city = city
    if (promoterId) where.promoterId = promoterId

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { venueName: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ]
    }

    if (category) {
      where.category = category
    }

    if (subTag) {
      where.subTags = { has: subTag }
    }

    if (suburb) {
      where.suburb = suburb
    }

    if (isFree) {
      const extra = Array.isArray(where.AND) ? where.AND : []
      where.AND = [
        ...extra,
        { OR: [{ isFree: true }, { price: { equals: 'Free', mode: 'insensitive' } }] },
        { OR: [{ priceMin: null }, { priceMin: { lte: 0 } }] },
        {
          OR: [
            { price: null },
            { price: { equals: 'Free', mode: 'insensitive' } },
            { price: { in: ['$0', '$0.00', '0', '0.00'] } },
            { NOT: { price: { contains: '$' } } },
          ],
        },
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

    const ids = events.map((e) => e.id)
    const me = await getSessionUser().catch(() => null)
    const [tiers, friends, mine] = await Promise.all([
      activeTierMap(ids),
      me ? friendsGoing(me.id, ids) : Promise.resolve({} as Record<string, string[]>),
      me && ids.length ? prisma.attendance.findMany({ where: { userId: me.id, eventId: { in: ids } }, select: { eventId: true } }) : Promise.resolve([]),
    ])
    const going = new Set(mine.map((m) => m.eventId))

    return NextResponse.json({
      events: events.map((e) => ({
        ...e,
        promoTier: tiers[e.id] ?? null,
        friendsGoing: friends[e.id] ?? [],
        going: going.has(e.id),
        confidenceLevel: confidence(e).level,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (err: any) {
    console.error('Error fetching events:', err?.message)
    return NextResponse.json({ events: [], total: 0, page: 1, totalPages: 0 }, { status: 500 })
  }
}
