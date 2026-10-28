import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sydneyToday } from '@/lib/event-store'
import { activePromoWhere } from '@/lib/promotions'
import { TIER_KEYS, TIER_RANK, type Tier } from '@/lib/tiers'
import { CITY_NAMES } from '@/lib/cities'
import { imageAssetSelect } from '@/lib/images/spec'

export const dynamic = 'force-dynamic'

const MIN_ITEMS = 8
const evSelect = {
  id: true, title: true, date: true, time: true, venueName: true, suburb: true, city: true,
  category: true, isFree: true, price: true, priceMin: true, priceMax: true, imageUrl: true, latitude: true, longitude: true,
  promoter: { select: { id: true, orgName: true, name: true } },
  imageAsset: { select: imageAssetSelect },
} as const

/**
 * Featured = popular & hot events.
 * 1) Paid promotions: Front-row add-on first (nationwide), then Premium/GOLD (nationwide), Spotlight/BRONZE, Featured/SILVER (selected city).
 * 2) Topped up with the most-saved / most-attended upcoming events ("HOT").
 */
export async function GET(req: NextRequest) {
  try {
    const city = req.nextUrl.searchParams.get('city') ?? ''
    const validCity = CITY_NAMES.includes(city) ? city : ''
    const today = sydneyToday()
    const promos = await prisma.promotion.findMany({
      where: {
        ...activePromoWhere(),
        tier: { in: [...TIER_KEYS, 'FRONTROW'] },
        event: { date: { gte: today } },
        ...(validCity ? { OR: [{ tier: { in: ['GOLD', 'FRONTROW'] } }, { event: { city: validCity } }] } : {}),
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
    const items: Record<string, unknown>[] = promoted.map((i) => ({ ...i.event, tier: i.tier, frontRow: frontRow.has(i.event.id) }))

    if (items.length < MIN_ITEMS) {
      const hot = await prisma.event.findMany({
        where: {
          date: { gte: today, lte: new Date(today.getTime() + 30 * 86400000) },
          id: { notIn: [...best.keys()] },
          ...(validCity ? { city: validCity } : {}),
        },
        orderBy: [{ savedBy: { _count: 'desc' } }, { attendees: { _count: 'desc' } }, { views: 'desc' }, { date: 'asc' }],
        take: MIN_ITEMS - items.length,
        select: evSelect,
      })
      items.push(...hot.map((e) => ({ ...e, tier: 'HOT', frontRow: false })))
    }
    return NextResponse.json({ items })
  } catch (e: any) {
    console.error('featured error', e?.message)
    return NextResponse.json({ items: [] }, { status: 500 })
  }
}
