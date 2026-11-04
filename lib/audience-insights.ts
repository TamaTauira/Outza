import { unstable_cache } from 'next/cache'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { AGE_BANDS, MIN_GROUP, PLAN_AHEAD, ageBandForYear, areaForPostcode, includeInAudience, planAheadBand } from '@/lib/profile-shared'
import { isQaAccountEmail } from '@/lib/qa-account'

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
 * No names, emails, years of birth or postcodes ever leave this function. Under-18s are left out of every
 * aggregate. Groups under MIN_GROUP people are hidden.
 */
/** Distinct people per category, aggregated in Postgres. Returns a handful of rows, not the engagement log. */
export async function otherInterestCounts(userIds: string[], eventIds: string[]): Promise<Map<string, Set<string>>> {
  const perCat = new Map<string, Set<string>>()
  if (!userIds.length || !eventIds.length) return perCat
  const users = Prisma.join(userIds)
  const events = Prisma.join(eventIds)
  const rows = await prisma.$queryRaw<{ category: string; uid: string }[]>`
    SELECT category, uid FROM (
      SELECT e.category AS category, s."userId" AS uid
      FROM "SavedEvent" s
      INNER JOIN "Event" e ON e.id = s."eventId"
      WHERE s."userId" IN (${users}) AND s."eventId" NOT IN (${events})
      UNION
      SELECT e.category, a."userId"
      FROM "Attendance" a
      INNER JOIN "Event" e ON e.id = a."eventId"
      WHERE a."userId" IN (${users}) AND a."eventId" NOT IN (${events})
      UNION
      SELECT e.category, g."userId"
      FROM "EventSignal" g
      INNER JOIN "Event" e ON e.id = g."eventId"
      WHERE g."userId" IN (${users}) AND g."eventId" NOT IN (${events}) AND g.kind <> 'VIEW'
    ) engaged
  `
  for (const row of rows) {
    if (!perCat.has(row.category)) perCat.set(row.category, new Set())
    perCat.get(row.category)!.add(row.uid)
  }
  return perCat
}

async function computeAudienceInsights(promoterId: string, sinceDays: number): Promise<AudienceInsights> {
  const events = await prisma.event.findMany({
    where: { promoterId, ...(sinceDays > 0 ? { date: { gte: new Date(Date.now() - sinceDays * 86400000) } } : {}) },
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
    prisma.eventSignal.findMany({ where: { eventId: { in: ids }, ...notMe }, select: { userId: true, eventId: true, createdAt: true, kind: true } }),
  ])

  // First engagement per person per event (for plan-ahead), and the set of people.
  const first = new Map<string, Date>()
  for (const r of [...saves, ...going, ...signals]) {
    const k = `${r.userId}|${r.eventId}`
    const prev = first.get(k)
    if (!prev || r.createdAt < prev) first.set(k, r.createdAt)
  }
  const people = [...new Set([...first.keys()].map((k) => k.split('|')[0]))]

  const users = await prisma.user.findMany({ where: { id: { in: people } }, select: { id: true, email: true, birthYear: true, homePostcode: true, preferredCategories: true } })
  const now = new Date()
  const adult = new Set(users.filter((u) => !isQaAccountEmail(u.email) && includeInAudience(u.birthYear, now)).map((u) => u.id))
  const tally = (rows: { userId: string; eventId: string }[]) => {
    const counts = new Map<string, number>()
    for (const row of rows) {
      if (!adult.has(row.userId)) continue
      counts.set(row.eventId, (counts.get(row.eventId) ?? 0) + 1)
    }
    return events.map((e) => ({ id: e.id, title: e.title, date: e.date.toISOString(), count: counts.get(e.id) ?? 0 }))
      .filter((e) => e.count >= MIN_GROUP).sort((a, b) => b.count - a.count).slice(0, 5)
  }
  const topSaved = tally(saves)
  const topShared = tally(signals.filter((s) => s.kind === 'SHARE'))
  const topItinerary = tally(signals.filter((s) => s.kind === 'ITINERARY'))

  const adultFirst = [...first.entries()].filter(([k]) => adult.has(k.split('|')[0]))
  const adultPeople = [...new Set(adultFirst.map(([k]) => k.split('|')[0]))]
  if (adultPeople.length < MIN_GROUP) return { ...EMPTY, topSaved, topShared, topItinerary }

  const ageCounts = new Map<string, number>()
  const areaCounts = new Map<string, number>()
  const adultUsers = users.filter((u) => adultPeople.includes(u.id))
  for (const u of adultUsers) {
    if (typeof u.birthYear === 'number') {
      const b = ageBandForYear(u.birthYear, now)
      if (b !== 'Under 18') ageCounts.set(b, (ageCounts.get(b) ?? 0) + 1)
    }
    const a = areaForPostcode(u.homePostcode)
    if (a) areaCounts.set(a, (areaCounts.get(a) ?? 0) + 1)
  }

  // Other interests: one grouped query instead of three 20k-row scans. Each person counts once per category.
  const perCat = await otherInterestCounts(adultPeople, ids)
  const add = (cat: string, uid: string) => { if (!perCat.has(cat)) perCat.set(cat, new Set()); perCat.get(cat)!.add(uid) }
  for (const u of adultUsers) for (const c of u.preferredCategories) add(c, u.id)
  const interestCounts = new Map([...perCat].map(([c, s]) => [c, s.size]))
  const visibleInterests = [...interestCounts].filter(([, c]) => c >= MIN_GROUP)
  // Interests overlap (one person can like several), so show each as a share of the adult audience.
  const interests = visibleInterests.map(([label, c]) => ({ label, pct: Math.min(100, Math.round((c / adultPeople.length) * 100)) }))
    .sort((a, b) => b.pct - a.pct).slice(0, 6)

  const planCounts = new Map<string, number>()
  for (const [k, at] of adultFirst) {
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
    audienceApprox: Math.floor(adultPeople.length / 10) * 10,
    ageBands: age.list,
    areas: area.list.slice(0, 8),
    interests,
    planAhead: plan.list,
    topSaved, topShared, topItinerary,
    hidden: age.hidden + area.hidden + plan.hidden + (interestCounts.size - visibleInterests.length),
  }
}

const cachedAudienceInsights = unstable_cache(
  (promoterId: string, sinceDays: number) => computeAudienceInsights(promoterId, sinceDays),
  ['audience-insights-v2'],
  { revalidate: 900 },
)

export async function getAudienceInsights(promoterId: string, opts: { sinceDays?: number } = {}): Promise<AudienceInsights> {
  const sinceDays = opts.sinceDays ?? 0
  return cachedAudienceInsights(promoterId, sinceDays)
}
