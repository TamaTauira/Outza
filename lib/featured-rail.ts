/**
 * Hot right now selection. Paid placements are ordered by the now window and never
 * dropped just because they start later. Organic cards fill in tiers.
 */
import { addDaysKey } from '@/lib/seo'
import {
  dateKeyOf,
  minutesOf,
  rankBoard,
  resolveSchedule,
  scheduleFinished,
  type SlotInput,
} from '@/lib/listing-window'
import { mixSponsored } from '@/lib/sponsorship'

/** Organic crowd-favourite cards the rail tries to fill. */
export const CROWD_TARGET = 8
/** Below this, upcoming events with images top the rail up. */
export const CROWD_FLOOR = 4
/** First upcoming band: tomorrow through this many days. */
export const CROWD_WEEK_DAYS = 7
/** Second upcoming band, used only when the week does not fill the rail. */
export const CROWD_FORTNIGHT_DAYS = 14

const BLOCKED_STATUS = new Set(['CANCELLED', 'POSTPONED', 'SOLD_OUT'])

export type CrowdCard = SlotInput & {
  id: string
  /** Saved count. Used for ranking, not sent on the card. */
  saves?: number
  /** Attendee count. Used for ranking, not sent on the card. */
  attendees?: number
  views?: number
  imageUrl?: string | null
  imageAsset?: { status?: string | null } | null
  sponsored?: boolean
  tier?: string
}

export type FeaturedRailInput<T extends CrowdCard> = {
  /** Events that cover today, including a run that started earlier and is still open. */
  today: T[]
  /** Most-saved events after today. The rail splits the next 7 days from days 8-14. */
  upcoming: T[]
  /** Soonest upcoming events that have a picture. Used only under the floor. */
  imaged: T[]
  /** Paid placements, already in package priority order. */
  sponsored: T[]
  day: string
  city: string
  nowMinutes: number
}

export function hasListingImage(ev: { imageUrl?: string | null; imageAsset?: { status?: string | null } | null }): boolean {
  if (typeof ev.imageUrl === 'string' && ev.imageUrl.trim()) return true
  return !!ev.imageAsset && ev.imageAsset.status !== 'FAILED'
}

/** Ended, cancelled, postponed, sold out, or a merged duplicate. */
export function featuredIneligible(ev: SlotInput, day: string, nowMinutes: number): boolean {
  if (ev.duplicateOfId) return true
  if (ev.status && BLOCKED_STATUS.has(ev.status)) return true
  return featuredEnded(ev, day, nowMinutes)
}

function featuredEnded(ev: SlotInput, day: string, nowMinutes: number): boolean {
  const start = dateKeyOf(ev.date)
  const end = dateKeyOf(ev.endDate) || start
  if (!start) return true
  if (end < day) return true
  if (start > day) return false
  // A run that continues past today is still on, even after today's clock.
  if (end > day) return false
  // Opened on an earlier day and finishes today. The finish clock belongs to today,
  // not as a minute offset from the opening midnight.
  if (start < day) {
    const finish = minutesOf(ev.endTime)
    if (finish == null) return false
    return nowMinutes >= finish
  }
  return scheduleFinished(resolveSchedule(ev, day), nowMinutes)
}

/** Saves, then attendees, then views. Same-day ties break toward the sooner start. */
function byCrowd(a: CrowdCard, b: CrowdCard): number {
  return (b.saves ?? 0) - (a.saves ?? 0)
    || (b.attendees ?? 0) - (a.attendees ?? 0)
    || (b.views ?? 0) - (a.views ?? 0)
    || dateKeyOf(a.date).localeCompare(dateKeyOf(b.date))
    || (minutesOf(a.time) ?? 24 * 60) - (minutesOf(b.time) ?? 24 * 60)
    || a.id.localeCompare(b.id)
}

function bySoonest(a: CrowdCard, b: CrowdCard): number {
  return dateKeyOf(a.date).localeCompare(dateKeyOf(b.date))
    || (minutesOf(a.time) ?? 24 * 60) - (minutesOf(b.time) ?? 24 * 60)
    || byCrowd(a, b)
}

function dedupe<T extends CrowdCard>(rows: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const row of rows) {
    if (!row.id || seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
  }
  return out
}

/** Board now-window order: on now, then starting soon, then long sessions and all-day. */
function onNowOrSoon<T extends CrowdCard>(rows: T[], city: string, day: string, nowMinutes: number): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const ranked = rankBoard(
    rows.map((row) => (row.status === 'RESCHEDULED' ? { ...row, status: 'SCHEDULED' } : row)),
    { window: 'now', day, nowMinutes, dropEnded: true },
  )
  const ordered = [...ranked.lead, ...ranked.soon, ...ranked.still, ...ranked.allday, ...ranked.possibly]
  const out: T[] = []
  const seen = new Set<string>()
  for (const row of ordered) {
    if (!row.id || seen.has(row.id)) continue
    const original = byId.get(row.id)
    if (!original) continue
    seen.add(row.id)
    out.push(original)
  }
  return out
}

/**
 * Now-window matches lead. Everything else keeps the caller's package order.
 * Ended, cancelled and duplicate placements drop. A later start does not.
 */
export function orderPaidPlacements<T extends CrowdCard>(
  rows: T[],
  opts: { day: string; city: string; nowMinutes: number },
): T[] {
  const eligible = dedupe(rows).filter((row) => !featuredIneligible(row, opts.day, opts.nowMinutes))
  const nowish = onNowOrSoon(eligible, opts.city, opts.day, opts.nowMinutes)
  const nowIds = new Set(nowish.map((row) => row.id))
  return [...nowish, ...eligible.filter((row) => !nowIds.has(row.id))]
}

function takeMostSavedSoonest<T extends CrowdCard>(rows: T[], count: number): T[] {
  if (count <= 0 || !rows.length) return []
  const chosen = [...rows].sort(byCrowd).slice(0, count)
  chosen.sort(bySoonest)
  return chosen
}

function selectCrowdFavourites<T extends CrowdCard>(
  input: FeaturedRailInput<T>,
  sponsoredIds: Set<string>,
): T[] {
  const { day, city, nowMinutes } = input
  const seen = new Set(sponsoredIds)
  const picked: T[] = []
  const take = (rows: T[], limit: number) => {
    for (const row of rows) {
      if (picked.length >= limit) break
      if (!row.id || seen.has(row.id) || row.sponsored) continue
      seen.add(row.id)
      picked.push(row)
    }
  }
  const open = (rows: T[]) => dedupe(rows).filter((row) => row.id && !seen.has(row.id) && !row.sponsored && !featuredIneligible(row, day, nowMinutes))

  const today = open(input.today)
  take(onNowOrSoon(today, city, day, nowMinutes), CROWD_TARGET)

  if (picked.length < CROWD_TARGET) {
    const restOfToday = today.filter((row) => !seen.has(row.id)).sort(byCrowd)
    take(restOfToday, CROWD_TARGET)
  }

  if (picked.length < CROWD_TARGET) {
    const upcoming = open(input.upcoming)
    const weekEnd = addDaysKey(day, CROWD_WEEK_DAYS)
    const fortnightEnd = addDaysKey(day, CROWD_FORTNIGHT_DAYS)
    const inBand = (row: T, after: string, until: string) => {
      const key = dateKeyOf(row.date)
      return key > after && key <= until
    }
    const week = upcoming.filter((row) => inBand(row, day, weekEnd))
    take(takeMostSavedSoonest(week, CROWD_TARGET - picked.length), CROWD_TARGET)
    if (picked.length < CROWD_TARGET) {
      const later = upcoming.filter((row) => inBand(row, weekEnd, fortnightEnd))
      take(takeMostSavedSoonest(later, CROWD_TARGET - picked.length), CROWD_TARGET)
    }
  }

  if (picked.length < CROWD_FLOOR) {
    const imaged = open(input.imaged)
      .filter((row) => hasListingImage(row) && dateKeyOf(row.date) >= day)
      .sort(bySoonest)
    take(imaged, CROWD_FLOOR)
  }

  return picked
}

/** Organic tiers, then paid cards interleaved under the sponsored cap. */
export function buildFeaturedRail<T extends CrowdCard>(input: FeaturedRailInput<T>): T[] {
  const sponsoredIds = new Set(input.sponsored.map((row) => row.id).filter(Boolean))
  const organic = selectCrowdFavourites(input, sponsoredIds)
  const paid = orderPaidPlacements(input.sponsored, input)
  return mixSponsored(organic, paid)
}
