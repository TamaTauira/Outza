import { prisma } from '@/lib/prisma'
import { toSydneyParts } from '@/lib/event-store'
import { cityDef } from '@/lib/cities'
import { activePromoWhere } from '@/lib/promotions'
import { popularity } from '@/lib/quality'
import { weekendRange } from '@/lib/seo'
import { buildProfile, rankDigest, type TasteAnchor } from './taste'

export const WINDOW_DAYS: Record<string, number> = { daily: 2, weekly: 7, monthly: 30 }
const BOOKABLE = ['SCHEDULED', 'RESCHEDULED']
/** How far ahead a Newsletter-boosted event can be and still ride in every issue while its boost is active. */
const BOOST_HORIZON_DAYS = 60
const SAVED_HORIZON_DAYS = 21
export const MAX_SPONSORED = 2

export const nlEventSelect = {
  id: true, title: true, description: true, date: true, endDate: true, time: true, endTime: true, venueName: true, venueAddress: true,
  suburb: true, city: true, category: true, subTags: true, isFree: true, isLGBTI: true, price: true, priceMin: true, priceMax: true, feesIncluded: true,
  imageUrl: true, ticketUrl: true, source: true, sources: true, status: true, statusSource: true, lastVerifiedAt: true, updatedAt: true,
  createdAt: true, latitude: true, longitude: true, ageRestriction: true, recurrence: true, duplicateOfId: true, views: true, ticketClicks: true,
  imageAsset: { select: { id: true, originalPath: true, sourceUrl: true, isPublic: true, status: true } },
  _count: { select: { savedBy: true, attendees: true } },
} as const

type Row = Awaited<ReturnType<typeof loadPool>>[number]
export type NlEvent = Row & {
  score: number
  why: string[]
  whyLine: string
  travel: string | null
  hasImage: boolean
  popularity: number
}

function decorate(row: Row): Row & { hasImage: boolean; popularity: number } {
  return {
    ...row,
    hasImage: !!(row.imageUrl || (row.imageAsset && row.imageAsset.status !== 'FAILED')),
    popularity: popularity({
      saves: row._count.savedBy,
      attendees: row._count.attendees,
      views: row.views,
      ticketClicks: row.ticketClicks,
      sources: row.sources,
      imageUrl: row.imageUrl,
    }),
  }
}

const anchor = (e: { id: string; title: string; category: string; venueName: string; suburb: string | null; subTags?: string[] }): TasteAnchor => ({
  id: e.id, title: e.title, category: e.category, venueName: e.venueName, suburb: e.suburb, subTags: e.subTags ?? [],
})

async function loadPool(city: string, from: Date, to: Date) {
  return prisma.event.findMany({
    where: { city, date: { gte: from, lt: to }, status: { in: BOOKABLE }, duplicateOfId: null },
    orderBy: [{ date: 'asc' }], take: 600, select: nlEventSelect,
  })
}

export interface Picked {
  hero: NlEvent | null
  weekend: NlEvent[]
  because: NlEvent[]
  saved: NlEvent[]
  free: NlEvent[]
  popular: NlEvent[]
  /** Labelled paid placements (Newsletter boost first, then Headliner), max MAX_SPONSORED. */
  sponsored: (NlEvent & { tier: string })[]
  /** Active Newsletter boosts for this city that didn't fit this issue (only when more than MAX_SPONSORED are running). */
  missedBoosts: number
  city: string
  from: Date
  to: Date
  poolSize: number
  thin: boolean
  greeting: string
  intro: string
  nearTitle: string
  becauseTitle: string | null
  reminderOptIn: boolean
}

/**
 * Personalised selection for one subscriber.
 * Stated taste: digest frequency, category follows, venue follows, cities, vibe (budget, free-only, family), home postcode area, age.
 * Behaviour: signed-in event views (EventSignal VIEW), saves, attendance, Together plans, itinerary adds, ticket and newsletter clicks.
 * Searches are not stored against a person, so they are not a signal.
 * Skips past, cancelled, duplicate and already-started events. Editorial picks skip the previous two real issues; saved reminders still appear.
 */
export async function pickEvents(userId: string, opts: { city?: string; edition?: string } = {}): Promise<Picked | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return null
  const city = opts.city || user.preferredCities[0] || user.homeCity || 'Sydney'
  const tz = cityDef(city).tz
  const now = new Date()
  const nowParts = toSydneyParts(now, tz)
  const from = new Date(`${nowParts.date}T00:00:00.000Z`)
  const editionDays = WINDOW_DAYS[opts.edition ?? user.emailFrequency] ?? 7
  const to = new Date(from.getTime() + editionDays * 86400e3)
  const savedUntil = new Date(from.getTime() + Math.max(editionDays, SAVED_HORIZON_DAYS) * 86400e3)
  const weekend = weekendRange(cityDef(city), now)
  const [hh, mm] = nowParts.time.split(':').map(Number)
  const nowMin = hh * 60 + mm

  const [pool, savedRows, attended, clicks, recent, signals, venueFollows, togetherItems, promos] = await Promise.all([
    loadPool(city, from, to),
    prisma.savedEvent.findMany({
      where: { userId, event: { date: { gte: from, lt: savedUntil }, status: { in: BOOKABLE }, duplicateOfId: null } },
      orderBy: { event: { date: 'asc' } },
      take: 40,
      select: { event: { select: nlEventSelect } },
    }),
    prisma.attendance.findMany({
      where: { userId },
      take: 80,
      select: { event: { select: { id: true, title: true, category: true, suburb: true, venueName: true, subTags: true, isFree: true, priceMin: true, time: true } } },
    }),
    prisma.newsletterClick.findMany({
      where: { send: { userId }, target: { not: 'unsubscribe' } },
      take: 200,
      orderBy: { createdAt: 'desc' },
      select: { category: true },
    }),
    prisma.newsletterSend.findMany({ where: { userId, status: 'SENT' }, orderBy: { sentAt: 'desc' }, take: 2, select: { eventIds: true } }),
    prisma.eventSignal.findMany({
      where: { userId, kind: { in: ['VIEW', 'TICKET', 'SHARE', 'ITINERARY'] } },
      orderBy: { createdAt: 'desc' },
      take: 400,
      select: { kind: true, event: { select: { id: true, title: true, category: true, suburb: true, venueName: true, subTags: true } } },
    }),
    prisma.venueFollow.findMany({ where: { userId }, select: { venueName: true }, take: 40 }),
    prisma.togetherItem.findMany({
      where: {
        eventId: { not: null },
        OR: [{ addedById: userId }, { plan: { creatorId: userId } }, { plan: { members: { some: { userId } } } }],
      },
      take: 80,
      select: { event: { select: { id: true, title: true, category: true, suburb: true, venueName: true, subTags: true } } },
    }),
    prisma.promotion.findMany({
      where: {
        ...activePromoWhere(), tier: { in: ['SPOTLIGHT', 'GOLD'] },
        event: { city, date: { gte: from, lte: new Date(from.getTime() + BOOST_HORIZON_DAYS * 86400e3) }, status: { in: BOOKABLE }, duplicateOfId: null },
      },
      select: { tier: true, eventId: true, createdAt: true },
    }),
  ])

  const byId = new Map<string, Row>()
  for (const row of pool) byId.set(row.id, row)
  for (const row of savedRows) byId.set(row.event.id, row.event)
  const together = togetherItems.flatMap((row) => (row.event ? [anchor(row.event)] : []))
  const missingTogether = together.map((row) => row.id).filter((id) => !byId.has(id))
  if (missingTogether.length) {
    const extra = await prisma.event.findMany({
      where: { id: { in: missingTogether }, date: { gte: from, lt: savedUntil }, status: { in: BOOKABLE }, duplicateOfId: null },
      select: nlEventSelect,
    })
    for (const row of extra) byId.set(row.id, row)
  }

  const viewed = signals.filter((s) => s.kind === 'VIEW').map((s) => anchor(s.event))
  const ticketed = signals.filter((s) => s.kind === 'TICKET').map((s) => anchor(s.event))
  const itinerary = signals.filter((s) => s.kind === 'ITINERARY').map((s) => anchor(s.event))
  const history = [...savedRows.map((s) => s.event), ...attended.map((a) => a.event)]
  const profile = buildProfile({
    name: user.name,
    city,
    homePostcode: user.homePostcode,
    preferredCategories: user.preferredCategories,
    vibe: user.vibeProfile,
    birthDate: user.birthDate,
    reminderOptIn: user.reminderOptIn,
    venueNames: venueFollows.map((v) => v.venueName),
    saved: savedRows.map((s) => anchor(s.event)),
    attended: attended.map((a) => anchor(a.event)),
    viewed,
    ticketed,
    itinerary,
    together,
    clickedCategories: [...clicks.map((c) => c.category).filter((c): c is string => !!c), ...signals.filter((s) => s.kind === 'SHARE').map((s) => s.event.category)],
    freeCount: history.filter((e) => e.isFree).length,
    paidPrices: history.flatMap((e) => (!e.isFree && e.priceMin != null ? [e.priceMin] : [])),
  })

  const seen = new Set(recent.flatMap((r) => r.eventIds))
  const promoIds = new Set(promos.map((p) => p.eventId))
  const ranked = rankDigest([...byId.values()].map(decorate), profile, {
    from, to, savedUntil, todayKey: nowParts.date, nowMin, weekend, seen, promoIds,
  })

  const used = new Set(ranked.usedIds)
  const { sponsored, missedBoosts } = await pickSponsored(promos, {
    from, to, todayKey: nowParts.date, nowMin, lastIssue: new Set(recent[0]?.eventIds ?? []),
    free: (e) => !used.has(e.id),
    take: (e) => used.add(e.id),
  })

  return {
    hero: ranked.hero, weekend: ranked.weekend, because: ranked.because, saved: ranked.saved, free: ranked.free, popular: ranked.popular,
    sponsored, missedBoosts, city, from, to, poolSize: pool.length, thin: ranked.thin, greeting: ranked.greeting, intro: ranked.intro,
    nearTitle: ranked.nearTitle, becauseTitle: ranked.becauseTitle, reminderOptIn: profile.reminderOptIn,
  }
}

type PromoRow = { tier: string; eventId: string; createdAt: Date }

/**
 * Fills up to MAX_SPONSORED labelled slots. Paid events are loaded directly (not from the editorial pool), so the
 * subscriber's repeat-avoidance and the editorial quality bar never knock out a placement someone paid for.
 * Order: Newsletter boosts first (ones this subscriber didn't see last issue, then soonest event, then oldest purchase),
 * then Headliner events in this issue's window.
 */
async function pickSponsored(promos: PromoRow[], o: { from: Date; to: Date; todayKey: string; nowMin: number; lastIssue: Set<string>; free: (e: NlEvent) => boolean; take: (e: NlEvent) => void }) {
  if (!promos.length) return { sponsored: [] as Picked['sponsored'], missedBoosts: 0 }
  const rows = await prisma.event.findMany({ where: { id: { in: [...new Set(promos.map((p) => p.eventId))] } }, select: nlEventSelect })
  const byId = new Map(rows.map((r) => [r.id, r]))
  const startsTooSoon = (e: Row) => {
    if (e.date.toISOString().slice(0, 10) !== o.todayKey || !e.time) return false
    const [h, m] = e.time.split(':').map(Number)
    return h * 60 + m < o.nowMin + 60
  }
  const rank = (p: PromoRow) => {
    const e = byId.get(p.eventId)!
    return [p.tier === 'SPOTLIGHT' ? 0 : 1, o.lastIssue.has(p.eventId) ? 1 : 0, e.date.getTime(), p.createdAt.getTime()]
  }
  const sorted = promos.filter((p) => byId.has(p.eventId)).sort((a, b) => {
    const ra = rank(a), rb = rank(b)
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i]
    return 0
  })
  const sponsored: Picked['sponsored'] = []
  const placed = new Set<string>()
  for (const p of sorted) {
    if (sponsored.length >= MAX_SPONSORED) break
    const row = byId.get(p.eventId)!
    if (placed.has(row.id) || startsTooSoon(row)) continue
    if (p.tier !== 'SPOTLIGHT' && row.date > o.to) continue
    const shaped = decorate(row)
    const e: NlEvent & { tier: string } = {
      ...shaped, score: 0, why: [`paid:${p.tier === 'SPOTLIGHT' ? 'newsletter-boost' : 'headliner'}`],
      whyLine: 'Paid placement from the organiser', travel: null, tier: p.tier,
    }
    if (!o.free(e)) continue
    sponsored.push(e); o.take(e); placed.add(row.id)
  }
  const boostIds = new Set(promos.filter((p) => p.tier === 'SPOTLIGHT' && byId.has(p.eventId) && !startsTooSoon(byId.get(p.eventId)!)).map((p) => p.eventId))
  const missedBoosts = [...boostIds].filter((id) => !placed.has(id)).length
  return { sponsored, missedBoosts }
}
