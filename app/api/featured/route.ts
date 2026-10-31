import { unstable_cache } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sydneyToday } from '@/lib/event-store'
import { activePromoWhere } from '@/lib/promotions'
import { minutesNow } from '@/lib/listing-window'
import { featuredBoosts, recordImpressions } from '@/lib/sponsorship-store'
import { TIER_KEYS, TIER_RANK, type Tier } from '@/lib/tiers'
import { CITY_NAMES } from '@/lib/cities'
import { imageAssetSelect } from '@/lib/images/spec'
import { publicCacheHeaders } from '@/lib/http-cache'
import { PUBLIC_EVENT_AND } from '@/lib/community-shared'
import { buildFeaturedRail, type CrowdCard } from '@/lib/featured-rail'

export const dynamic = 'force-dynamic'

const evSelect = {
  id: true, title: true, date: true, endDate: true, time: true, endTime: true, venueName: true, suburb: true, city: true,
  category: true, isFree: true, price: true, priceMin: true, priceMax: true, imageUrl: true, latitude: true, longitude: true,
  status: true, duplicateOfId: true, allDay: true, startsAt: true, endsAt: true, seriesKey: true,
  promoter: { select: { id: true, orgName: true, name: true } },
  imageAsset: { select: imageAssetSelect },
} as const

const DAY_MS = 86400000
/** Same span as the board's "starting soon" bucket, so the on-now query does not miss it. */
const SOON_MS = 180 * 60 * 1000

const crowdSelect = {
  ...evSelect,
  views: true,
  _count: { select: { savedBy: true, attendees: true } },
} as const

const crowdOrder = [
  { savedBy: { _count: 'desc' as const } },
  { attendees: { _count: 'desc' as const } },
  { views: 'desc' as const },
  { date: 'asc' as const },
]

function listable(validCity: string, exclude: string[]) {
  return {
    duplicateOfId: null,
    status: { notIn: ['CANCELLED', 'POSTPONED', 'SOLD_OUT'] },
    ...(exclude.length ? { id: { notIn: exclude } } : {}),
    ...(validCity ? { city: validCity } : {}),
  }
}

function crowdCards<T extends { id: string; views: number; _count: { savedBy: number; attendees: number } }>(rows: T[]) {
  return rows.map((row) => {
    const { _count, views, ...rest } = row
    return {
      ...rest,
      views,
      saves: _count.savedBy,
      attendees: _count.attendees,
      tier: 'HOT',
      frontRow: false,
      sponsored: false,
    }
  })
}

function presentCard(row: Record<string, unknown>) {
  const rest = { ...row }
  delete rest.saves
  delete rest.attendees
  delete rest.views
  delete rest._count
  delete rest.seriesKey
  return rest
}

/**
 * Hot right now.
 * Paid placements stay even when they are not on tonight. The now window only orders them.
 * Organic cards fill to about 8: on now or soon, then the rest of today by saves, attendees and views,
 * then the most-saved events in the next 7 days (and days 8-14 if that is still short), soonest first.
 * Below 4 organic cards, upcoming events with images fill the gap. Sponsored cards stay capped.
 */
async function queryFeatured(validCity: string, day: string) {
    const today = new Date(`${day}T00:00:00.000Z`)
    const promos = await prisma.promotion.findMany({
      where: {
        ...activePromoWhere(),
        tier: { in: [...TIER_KEYS, 'FRONTROW'] },
        event: {
          date: { gte: today },
          duplicateOfId: null,
          deletedAt: null,
          status: { notIn: ['CANCELLED', 'POSTPONED', 'SOLD_OUT'] },
        },
        ...(validCity ? { OR: [{ tier: 'FRONTROW' }, { event: { city: validCity } }] } : {}),
      },
      select: { tier: true, eventId: true, event: { select: evSelect } },
      take: 300,
    })
    const frontRow = new Set(promos.filter((p) => p.tier === 'FRONTROW').map((p) => p.eventId))
    const best = new Map<string, { tier: Tier; event: (typeof promos)[number]['event'] }>()
    for (const p of promos) {
      if (p.tier === 'FRONTROW') continue
      const t = p.tier as Tier
      const cur = best.get(p.event.id)
      if (!cur || TIER_RANK[t] > TIER_RANK[cur.tier]) best.set(p.event.id, { tier: t, event: p.event })
    }
    // A front-row add-on always shows, even if its package is in another city
    for (const p of promos) if (p.tier === 'FRONTROW' && !best.has(p.eventId)) best.set(p.eventId, { tier: 'SILVER', event: p.event })

    const promoted = [...best.values()].sort((a, b) =>
      Number(frontRow.has(b.event.id)) - Number(frontRow.has(a.event.id)) ||
      TIER_RANK[b.tier] - TIER_RANK[a.tier] ||
      Number(b.event.city === validCity) - Number(a.event.city === validCity) ||
      a.event.date.getTime() - b.event.date.getTime(),
    )
    const packageCards: Record<string, unknown>[] = promoted.map((i) => ({ ...i.event, tier: i.tier, frontRow: frontRow.has(i.event.id), sponsored: true }))
    let boostCards: Record<string, unknown>[] = []
    try {
      boostCards = await featuredBoosts(validCity, today) as Record<string, unknown>[]
    } catch (error) {
      console.error('short boosts', error)
    }
    const seen = new Set<string>()
    const sponsored: Record<string, unknown>[] = []
    for (const card of [...packageCards, ...boostCards]) {
      const id = String(card.id)
      if (seen.has(id)) continue
      seen.add(id)
      sponsored.push(card)
    }
    const now = new Date()
    const soonAt = new Date(now.getTime() + SOON_MS)
    const tomorrow = new Date(today.getTime() + DAY_MS)
    const weekEnd = new Date(today.getTime() + 7 * DAY_MS)
    const fortnightEnd = new Date(today.getTime() + 14 * DAY_MS)
    const exclude = [...seen]
    const open = listable(validCity, exclude)
    const coverToday = {
      OR: [
        { date: { gte: today, lt: tomorrow } },
        { AND: [{ date: { lt: today } }, { endDate: { gte: today } }] },
      ],
    }
    const [nowRows, todayRows, weekRows, fortnightRows, imageRows] = await Promise.all([
      prisma.event.findMany({
        where: {
          ...open,
          AND: [
            ...PUBLIC_EVENT_AND,
            coverToday,
            {
              OR: [
                { startsAt: { lte: soonAt }, endsAt: { gt: now } },
                { startsAt: { lte: now }, endsAt: null },
                { startsAt: { gt: now, lte: soonAt } },
                { allDay: true, endsAt: { gt: now } },
                { allDay: true, endsAt: null },
              ],
            },
          ],
        },
        orderBy: [{ startsAt: 'desc' }],
        take: 200,
        select: crowdSelect,
      }),
      prisma.event.findMany({
        where: { ...open, AND: [...PUBLIC_EVENT_AND, coverToday] },
        orderBy: crowdOrder,
        take: 60,
        select: crowdSelect,
      }),
      prisma.event.findMany({
        where: { ...open, date: { gte: tomorrow, lte: weekEnd }, AND: [...PUBLIC_EVENT_AND] },
        orderBy: crowdOrder,
        take: 40,
        select: crowdSelect,
      }),
      prisma.event.findMany({
        where: { ...open, date: { gt: weekEnd, lte: fortnightEnd }, AND: [...PUBLIC_EVENT_AND] },
        orderBy: crowdOrder,
        take: 40,
        select: crowdSelect,
      }),
      prisma.event.findMany({
        where: {
          ...open,
          date: { gte: today },
          AND: [
            ...PUBLIC_EVENT_AND,
            { OR: [{ imageUrl: { not: null } }, { imageAssetId: { not: null } }] },
          ],
        },
        orderBy: [{ date: 'asc' }, { time: 'asc' }],
        take: 24,
        select: crowdSelect,
      }),
    ])
    const todayPool = new Map<string, (typeof nowRows)[number]>()
    for (const row of nowRows) todayPool.set(row.id, row)
    for (const row of todayRows) todayPool.set(row.id, row)
    const items = buildFeaturedRail({
      today: crowdCards([...todayPool.values()]) as CrowdCard[],
      upcoming: crowdCards([...weekRows, ...fortnightRows]) as CrowdCard[],
      imaged: crowdCards(imageRows) as CrowdCard[],
      sponsored: sponsored as CrowdCard[],
      day,
      city: validCity || 'Sydney',
      nowMinutes: minutesNow(validCity || 'Sydney', now),
    }).map((row) => presentCard(row as Record<string, unknown>))
    return JSON.parse(JSON.stringify({ items })) as { items: Record<string, unknown>[] }
}

const cachedFeatured = unstable_cache(queryFeatured, ['featured-v5'], { revalidate: 60 })

export async function GET(req: NextRequest) {
  try {
    const city = req.nextUrl.searchParams.get('city') ?? ''
    const validCity = CITY_NAMES.includes(city) ? city : ''
    const day = sydneyToday().toISOString().slice(0, 10)
    const body = await cachedFeatured(validCity, day)
    const campaignIds = body.items.map((item) => item.campaignId).filter((id): id is string => typeof id === 'string')
    if (campaignIds.length) await recordImpressions(campaignIds, 'FEATURED')
    return NextResponse.json(body, { headers: publicCacheHeaders(60) })
  } catch (e: any) {
    console.error('featured error', e?.message)
    return NextResponse.json({ items: [] }, { status: 500 })
  }
}
