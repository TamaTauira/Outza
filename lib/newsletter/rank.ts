import { prisma } from '@/lib/prisma'
import { toSydneyParts } from '@/lib/event-store'
import { cityDef } from '@/lib/cities'
import { activePromoWhere } from '@/lib/promotions'
import { confidence, popularity } from '@/lib/quality'
import { asVibe, VIBE_CATEGORIES } from '@/lib/vibe-shared'

export const WINDOW_DAYS: Record<string, number> = { daily: 2, weekly: 7, monthly: 30 }
const BOOKABLE = ['SCHEDULED', 'RESCHEDULED']
/** How far ahead a Newsletter-boosted event can be and still ride in every issue while its boost is active. */
const BOOST_HORIZON_DAYS = 60
export const MAX_SPONSORED = 2

export const nlEventSelect = {
  id: true, title: true, description: true, date: true, endDate: true, time: true, endTime: true, venueName: true, venueAddress: true,
  suburb: true, city: true, category: true, subTags: true, isFree: true, isLGBTI: true, price: true, priceMin: true, priceMax: true, feesIncluded: true,
  imageUrl: true, ticketUrl: true, source: true, sources: true, status: true, statusSource: true, lastVerifiedAt: true, updatedAt: true,
  createdAt: true, latitude: true, recurrence: true, duplicateOfId: true, views: true, ticketClicks: true,
  imageAsset: { select: { id: true, originalPath: true, sourceUrl: true, isPublic: true, status: true } },
  _count: { select: { savedBy: true, attendees: true } },
} as const

type Row = Awaited<ReturnType<typeof loadPool>>[number]
export type NlEvent = Row & { score: number; conf: number; why: string[] }

async function loadPool(city: string, from: Date, to: Date) {
  return prisma.event.findMany({
    where: { city, date: { gte: from, lte: to }, status: { in: BOOKABLE }, duplicateOfId: null },
    orderBy: [{ date: 'asc' }], take: 600, select: nlEventSelect,
  })
}

const hourBucket = (t?: string | null) => {
  const h = t ? parseInt(t, 10) : NaN
  return Number.isNaN(h) ? null : h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
}

const share = (m: Map<string, number>, k: string | null | undefined) => {
  if (!k) return 0
  const total = [...m.values()].reduce((a, b) => a + b, 0)
  return total ? (m.get(k) ?? 0) / total : 0
}
const bump = (m: Map<string, number>, k: string | null | undefined, n = 1) => { if (k) m.set(k, (m.get(k) ?? 0) + n) }

export interface Picked {
  hero: NlEvent | null
  picks: NlEvent[]
  wildcard: NlEvent | null
  /** Labelled paid placements (Newsletter boost first, then Headliner), max MAX_SPONSORED. */
  sponsored: (NlEvent & { tier: string })[]
  /** Active Newsletter boosts for this city that didn't fit this issue (only when more than MAX_SPONSORED are running). */
  missedBoosts: number
  city: string
  from: Date
  to: Date
  poolSize: number
}

/**
 * Personalised selection for one subscriber. Signals: stated interests, categories/suburbs/times/budget of saved and
 * attended events, past newsletter clicks, data confidence, community popularity, freshness and imagery.
 * Excludes cancelled/postponed/duplicate/started events and anything featured in the subscriber's previous two issues.
 */
export async function pickEvents(userId: string, opts: { city?: string; edition?: string } = {}): Promise<Picked | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return null
  const city = opts.city || user.preferredCities[0] || user.homeCity || 'Sydney'
  const tz = cityDef(city).tz
  const nowParts = toSydneyParts(new Date(), tz)
  const from = new Date(`${nowParts.date}T00:00:00.000Z`)
  const to = new Date(from.getTime() + (WINDOW_DAYS[opts.edition ?? user.emailFrequency] ?? 7) * 86400e3)

  const [pool, saved, attended, clicks, recent] = await Promise.all([
    loadPool(city, from, to),
    prisma.savedEvent.findMany({ where: { userId }, take: 200, orderBy: { createdAt: 'desc' }, select: { event: { select: { category: true, suburb: true, time: true, priceMin: true, isFree: true } } } }),
    prisma.attendance.findMany({ where: { userId }, take: 200, select: { event: { select: { category: true, suburb: true, time: true, priceMin: true, isFree: true } } } }),
    prisma.newsletterClick.findMany({ where: { send: { userId } }, take: 300, orderBy: { createdAt: 'desc' }, select: { category: true } }),
    prisma.newsletterSend.findMany({ where: { userId, status: 'SENT' }, orderBy: { sentAt: 'desc' }, take: 2, select: { eventIds: true } }),
  ])

  const cat = new Map<string, number>(), sub = new Map<string, number>(), tod = new Map<string, number>(), clickCat = new Map<string, number>()
  const prices: number[] = []
  let freeCount = 0
  for (const { event: e } of [...saved, ...attended]) {
    bump(cat, e.category); bump(sub, e.suburb); bump(tod, hourBucket(e.time))
    if (e.isFree) freeCount++
    else if (e.priceMin != null) prices.push(e.priceMin)
  }
  for (const c of clicks) bump(clickCat, c.category)
  prices.sort((a, b) => a - b)
  const budget = prices.length >= 3 ? prices[Math.floor(prices.length / 2)] : null
  const history = saved.length + attended.length
  const interests = new Set(user.preferredCategories)
  const vibe = asVibe(user.vibeProfile)
  const vibeCats = new Set((vibe.vibes ?? []).flatMap((v) => VIBE_CATEGORIES[v] ?? []))
  const vibeLgbtiq = (vibe.vibes ?? []).includes('LGBTIQ+ scene')
  const lovesFree = (vibe.spend ?? []).includes('Free is my favourite price')
  const seenBefore = new Set(recent.flatMap((r) => r.eventIds))
  const nowMin = (() => { const [h, m] = nowParts.time.split(':').map(Number); return h * 60 + m })()
  const todayKey = nowParts.date

  const scored: NlEvent[] = []
  for (const e of pool) {
    if (seenBefore.has(e.id)) continue
    if (/\b(sold[- ]?out|cancell?ed|postponed)\b/i.test(e.title)) continue // organiser flagged it in the title
    const dKey = e.date.toISOString().slice(0, 10)
    if (dKey === todayKey && e.time) {
      const [h, m] = e.time.split(':').map(Number)
      if (h * 60 + m < nowMin + 60) continue // starting within the hour or already started
    }
    const why: string[] = []
    let s = 0
    if (interests.has(e.category)) { s += 30; why.push('interest') }
    else if (vibeCats.has(e.category)) { s += 15; why.push('vibe') }
    if (vibeLgbtiq && e.isLGBTI) { s += 10; why.push('vibe') }
    if (lovesFree && e.isFree) { s += 8; why.push('free') }
    const aff = share(cat, e.category); if (aff) { s += aff * 25; why.push('saved-category') }
    const ck = share(clickCat, e.category); if (ck) { s += ck * 15; why.push('clicked-category') }
    if (share(sub, e.suburb) > 0) { s += 5; why.push('suburb') }
    if (share(tod, hourBucket(e.time)) >= 0.4) { s += 5; why.push('time-of-day') }
    if (budget != null && e.priceMin != null && e.priceMin <= budget * 1.5) { s += 5; why.push('budget') }
    if (e.isFree && history && freeCount / history >= 0.3) { s += 4; why.push('free') }
    const c = confidence({ ...e, promoterVerified: false })
    s += c.score / 8
    s += Math.log1p(popularity({ saves: e._count.savedBy, attendees: e._count.attendees, views: e.views, ticketClicks: e.ticketClicks, sources: e.sources, imageUrl: e.imageUrl })) * 4
    if (Date.now() - e.createdAt.getTime() < 7 * 86400e3) { s += 3; why.push('new') }
    if (e.imageUrl || e.imageAsset) s += 6
    if (c.level === 'low') s -= 15
    scored.push({ ...e, score: s, conf: c.score, why })
  }
  scored.sort((a, b) => b.score - a.score)

  const used = new Set<string>()
  const usedSeries = new Set<string>()
  const titleKey = (e: NlEvent) => e.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 40)
  const take = (e: NlEvent) => { used.add(e.id); usedSeries.add(titleKey(e)) }
  const free = (e: NlEvent) => !used.has(e.id) && !usedSeries.has(titleKey(e))
  const hasImg = (e: NlEvent) => !!(e.imageUrl || e.imageAsset) && e.imageAsset?.status !== 'FAILED'

  // Paid placements. Newsletter boost (SPOTLIGHT add-on) is what promoters buy to be in these emails: every issue for
  // the event's city carries it while the boost is active and the event is still ahead (even beyond this issue's window),
  // repeats across issues are intended. Headliner (GOLD, "newsletter eligibility") fills any slot left, in-window only.
  const promos = await prisma.promotion.findMany({
    where: {
      ...activePromoWhere(), tier: { in: ['SPOTLIGHT', 'GOLD'] },
      event: { city, date: { gte: from, lte: new Date(from.getTime() + BOOST_HORIZON_DAYS * 86400e3) }, status: { in: BOOKABLE }, duplicateOfId: null },
    },
    select: { tier: true, eventId: true, createdAt: true },
  })
  const promoIds = new Set(promos.map((p) => p.eventId))

  const hero = scored.find((e) => hasImg(e) && e.conf >= 50 && !promoIds.has(e.id)) ?? scored.find((e) => !promoIds.has(e.id)) ?? null
  if (hero) take(hero)

  const picks: NlEvent[] = []
  const pickCats = new Set<string>(hero ? [hero.category] : [])
  const pickDays = new Set<string>()
  for (const pass of [0, 1, 2]) {
    for (const e of scored) {
      if (picks.length >= 3) break
      if (!free(e) || promoIds.has(e.id) || e.conf < 50) continue
      const day = e.date.toISOString().slice(0, 10)
      if (pass === 0 && (pickCats.has(e.category) || pickDays.has(day))) continue
      if (pass === 1 && pickCats.has(e.category)) continue
      picks.push(e); take(e); pickCats.add(e.category); pickDays.add(day)
    }
  }

  const familiar = new Set([...interests, ...cat.keys(), ...clickCat.keys(), ...pickCats])
  const wildcard = scored.find((e) => free(e) && !promoIds.has(e.id) && !familiar.has(e.category) && e.conf >= 60 && hasImg(e)) ?? null
  if (wildcard) take(wildcard)

  const { sponsored, missedBoosts } = await pickSponsored(promos, { from, to, todayKey, nowMin, lastIssue: new Set(recent[0]?.eventIds ?? []), free: (e) => !used.has(e.id), take })
  return { hero, picks, wildcard, sponsored, missedBoosts, city, from, to, poolSize: pool.length }
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
    const e: NlEvent & { tier: string } = { ...row, score: 0, conf: 100, why: [`paid:${p.tier === 'SPOTLIGHT' ? 'newsletter-boost' : 'headliner'}`], tier: p.tier }
    if (!o.free(e)) continue
    sponsored.push(e); o.take(e); placed.add(row.id)
  }
  const boostIds = new Set(promos.filter((p) => p.tier === 'SPOTLIGHT' && byId.has(p.eventId) && !startsTooSoon(byId.get(p.eventId)!)).map((p) => p.eventId))
  const missedBoosts = [...boostIds].filter((id) => !placed.has(id)).length
  return { sponsored, missedBoosts }
}
