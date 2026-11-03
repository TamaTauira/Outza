/**
 * Time-decayed popularity for organic ranking.
 * Day buckets stand in for rolling 24-hour, 7-day and 30-day windows.
 * Paid placements do not receive a heat score. Lifetime views cannot win on their own.
 */

export const ENGAGEMENT_KINDS = ['VIEW', 'UNIQUE_VIEW', 'SAVE', 'GOING', 'REACTION', 'TICKET', 'SHARE'] as const
export type EngagementKind = (typeof ENGAGEMENT_KINDS)[number]

/** Below this weighted total, heat stays 0 and the existing save order decides. */
export const HEAT_FLOOR = 8

const WEIGHT: Record<EngagementKind, number> = {
  VIEW: 0.15,
  UNIQUE_VIEW: 1.2,
  SAVE: 4,
  GOING: 4,
  REACTION: 3,
  TICKET: 5,
  SHARE: 1.5,
}

const VIEW_DAY_CAP = 40

export type EngagementPoint = {
  day: string
  kind: string
  count: number
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}

function ageDays(day: string, today: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null
  const a = Date.parse(`${day}T00:00:00.000Z`)
  const b = Date.parse(`${today}T00:00:00.000Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((b - a) / 86400000)
}

function band(age: number): number {
  if (age <= 0) return 1
  if (age <= 6) return 0.55
  if (age <= 29) return 0.2
  return 0
}

function weighted(point: EngagementPoint, decay: number): number {
  if (!(ENGAGEMENT_KINDS as readonly string[]).includes(point.kind)) return 0
  const kind = point.kind as EngagementKind
  const count = kind === 'VIEW' ? Math.min(Math.max(point.count, 0), VIEW_DAY_CAP) : Math.max(point.count, 0)
  return count * WEIGHT[kind] * decay
}

/**
 * Organic heat. A handful of actions stay under the floor so one account cannot
 * jump the rail. Activity older than 30 days is ignored.
 */
export function heatScore(points: EngagementPoint[], now = new Date()): number {
  const today = utcDay(now)
  let raw = 0
  let todayRaw = 0
  let weekRest = 0
  for (const point of points) {
    const age = ageDays(point.day, today)
    if (age == null || age < 0) continue
    const decay = band(age)
    if (!decay) continue
    const value = weighted(point, decay)
    raw += value
    if (age === 0) todayRaw += value
    else if (age <= 6) weekRest += value
  }
  const daily = weekRest / 6
  if (todayRaw >= 6 && todayRaw >= daily * 2) raw += todayRaw * 0.25
  if (raw < HEAT_FLOOR) return 0
  return Math.round(raw * 10) / 10
}

/** Sponsored cards keep their package order. Heat is only for organic cards. */
export function organicHeat(sponsored: boolean, score: number): number {
  if (sponsored) return 0
  return score > 0 ? score : 0
}
