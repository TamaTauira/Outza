import { unstable_cache } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sydneyToday } from '@/lib/event-store'
import { activePromoWhere } from '@/lib/promotions'
import { mixSponsored } from '@/lib/sponsorship'
import { featuredBoosts, recordImpressions } from '@/lib/sponsorship-store'
import { TIER_KEYS, TIER_RANK, type Tier } from '@/lib/tiers'
import { CITY_NAMES } from '@/lib/cities'
import { imageAssetSelect } from '@/lib/images/spec'
import { publicCacheHeaders } from '@/lib/http-cache'

export const dynamic = 'force-dynamic'

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
async function queryFeatured(validCity: string, day: string) {
    const today = new Date(`${day}T00:00:00.000Z`)
    const promos = await prisma.promotion.findMany({
      where: {
        ...activePromoWhere(),
        tier: { in: [...TIER_KEYS, 'FRONTROW'] },
        event: { date: { gte: today } },
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
    const hot = await prisma.event.findMany({
      where: {
        date: { gte: today, lte: new Date(today.getTime() + 30 * 86400000) },
        id: { notIn: [...seen] },
        duplicateOfId: null,
        ...(validCity ? { city: validCity } : {}),
      },
      orderBy: [{ savedBy: { _count: 'desc' } }, { attendees: { _count: 'desc' } }, { views: 'desc' }, { date: 'asc' }],
      take: 16,
      select: evSelect,
    })
    const organic = hot.map((e) => ({ ...e, tier: 'HOT', frontRow: false, sponsored: false }))
    const items = mixSponsored(organic, sponsored)
    return JSON.parse(JSON.stringify({ items })) as { items: Record<string, unknown>[] }
}

const cachedFeatured = unstable_cache(queryFeatured, ['featured-v2'], { revalidate: 60 })

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
