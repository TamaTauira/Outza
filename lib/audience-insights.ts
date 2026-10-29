import { prisma } from '@/lib/db'
import { AGE_BANDS, MIN_GROUP, PLAN_AHEAD, ageBand, areaForPostcode, planAheadBand } from '@/lib/profile-shared'

export type Share = { label: string; pct: number }
export type TopEvent = { id: string; title: string; date: string; count: number }
export type AudienceInsights = {
  /** False when fewer than MIN_GROUP people engaged; every breakdown is then empty. */
  enough: boolean
  /** Audience size rounded down to the nearest 10 (never an exact figure). */
  audienceApprox: number
  ageBands: Share[]
  areas: Share[]
  interests: Share[]
  planAhead: Share[]
  topSaved: TopEvent[]
  topShared: TopEvent[]
  topItinerary: TopEvent[]
  /** How many groups were hidden because they had fewer than MIN_GROUP people. */
  hidden: number
}

const EMPTY: AudienceInsights = { enough: false, audienceApprox: 0, ageBands: [], areas: [], interests: [], planAhead: [], topSaved: [], topShared: [], topItinerary: [], hidden: 0 }

/** Turns raw group counts into percentages, dropping groups under MIN_GROUP. Percentages are of the visible groups only,
 *  so a hidden group's size can't be worked out by subtraction. */
function shares(counts: Map<string, number>, order?: readonly string[]): { list: Share[]; hidden: number } {
  const visible = [...counts].filter(([, c]) => c >= MIN_GROUP)
  const hidden = counts.size - visible.length
  const total = visible.reduce((s, [, c]) => s + c, 0)
  if (!total) return { list: [], hidden }
  const list = visible.map(([label, c]) => ({ label, pct: Math.round((c / total) * 100) }))
  list.sort(order ? (a, b) => order.indexOf(a.label) - order.indexOf(b.label) : (a, b) => b.pct - a.pct)
  return { list, hidden }
}

/**
 * Grouped, anonymised audience insights for one promoter's events, built from saves, "going", ticket taps, shares,
 * itinerary adds and views by signed-in people on VibePeep. VibePeep doesn't sell tickets, so this is interest, not purchasers.
 * No names, emails, exact ages, birthdays or postcodes ever leave this function; groups under MIN_GROUP people are hidden.
 */
export async function getAudienceInsights(promoterId: string, opts: { sinceDays?: number } = {}): Promise<AudienceInsights> {
  const events = await prisma.event.findMany({
    where: { promoterId, ...(opts.sinceDays ? { date: { gte: new Date(Date.now() - opts.sinceDays * 86400000) } } : {}) },
    orderBy: { date: 'desc' },
    take: 300,
    select: { id: true, title: true, date: true, shares: true, itineraryAdds: true, _count: { select: { savedBy: true } } },
  })
  if (!events.length) return EMPTY
  const ids = events.map((e) => e.id)
  const dateOf = new Map(events.map((e) => [e.id, e.date]))

  const notMe = { userId: { not: promoterId } }
  const [saves, going, signals] = await Promise.all([
    prisma.savedEvent.findMany({ where: { eventId: { in: ids }, ...notMe }, select: { userId: true, eventId: true, createdAt: true } }),
    prisma.attendance.findMany({ where: { eventId: { in: ids }, ...notMe }, select: { userId: true, eventId: true, createdAt: true } }),
    prisma.eventSignal.findMany({ where: { eventId: { in: ids }, ...notMe }, select: { userId: true, eventId: true, createdAt: true } }),
  ])

  // First engagement per person per event (for plan-ahead), and the set of people.
  const first = new Map<string, Date>()
  for (const r of [...saves, ...going, ...signals]) {
    const k = `${r.userId}|${r.eventId}`
    const prev = first.get(k)
    if (!prev || r.createdAt < prev) first.set(k, r.createdAt)
  }
  const people = [...new Set([...first.keys()].map((k) => k.split('|')[0]))]

  const top = (pick: (e: (typeof events)[number]) => number): TopEvent[] =>
    events.map((e) => ({ id: e.id, title: e.title, date: e.date.toISOString(), count: pick(e) }))
      .filter((e) => e.count >= MIN_GROUP).sort((a, b) => b.count - a.count).slice(0, 5)
  const topSaved = top((e) => e._count.savedBy)
  const topShared = top((e) => e.shares)
  const topItinerary = top((e) => e.itineraryAdds)

  if (people.length < MIN_GROUP) return { ...EMPTY, topSaved, topShared, topItinerary }

  const users = await prisma.user.findMany({ where: { id: { in: people } }, select: { id: true, birthDate: true, homePostcode: true, preferredCategories: true } })
  const now = new Date()
  const ageCounts = new Map<string, number>()
  const areaCounts = new Map<string, number>()
  for (const u of users) {
    if (u.birthDate) { const b = ageBand(u.birthDate, now); ageCounts.set(b, (ageCounts.get(b) ?? 0) + 1) }
    const a = areaForPostcode(u.homePostcode)
    if (a) areaCounts.set(a, (areaCounts.get(a) ?? 0) + 1)
  }

  // Other interests: categories of other events these people engaged with, plus the interests they chose themselves.
  const notThese = { userId: { in: people }, eventId: { notIn: ids } }
  const [oSaves, oGoing, oSignals] = await Promise.all([
    prisma.savedEvent.findMany({ where: notThese, select: { userId: true, event: { select: { category: true } } }, take: 20000 }),
    prisma.attendance.findMany({ where: notThese, select: { userId: true, event: { select: { category: true } } }, take: 20000 }),
    prisma.eventSignal.findMany({ where: { ...notThese, kind: { not: 'VIEW' } }, select: { userId: true, event: { select: { category: true } } }, take: 20000 }),
  ])
  const perCat = new Map<string, Set<string>>()
  const add = (cat: string, uid: string) => { if (!perCat.has(cat)) perCat.set(cat, new Set()); perCat.get(cat)!.add(uid) }
  for (const r of [...oSaves, ...oGoing, ...oSignals]) add(r.event.category, r.userId)
  for (const u of users) for (const c of u.preferredCategories) add(c, u.id)
  const interestCounts = new Map([...perCat].map(([c, s]) => [c, s.size]))
  const visibleInterests = [...interestCounts].filter(([, c]) => c >= MIN_GROUP)
  // Interests overlap (one person can like several), so show each as a share of the whole audience.
  const interests = visibleInterests.map(([label, c]) => ({ label, pct: Math.min(100, Math.round((c / people.length) * 100)) }))
    .sort((a, b) => b.pct - a.pct).slice(0, 6)

  const planCounts = new Map<string, number>()
  for (const [k, at] of first) {
    const d = dateOf.get(k.split('|')[1])
    if (!d) continue
    const b = planAheadBand(at, d)
    planCounts.set(b, (planCounts.get(b) ?? 0) + 1)
  }

  const age = shares(ageCounts, AGE_BANDS)
  const area = shares(areaCounts)
  const plan = shares(planCounts, PLAN_AHEAD)
  return {
    enough: true,
    audienceApprox: Math.floor(people.length / 10) * 10,
    ageBands: age.list,
    areas: area.list.slice(0, 8),
    interests,
    planAhead: plan.list,
    topSaved, topShared, topItinerary,
    hidden: age.hidden + area.hidden + plan.hidden + (interestCounts.size - visibleInterests.length),
  }
}
