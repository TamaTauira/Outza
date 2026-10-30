/**
 * Operating-window ranking and listing normalisation.
 * Client-safe. The confidence number stays internal: nothing here formats it for display.
 */
import { addDaysKey } from '@/lib/seo'
import { cityDef } from '@/lib/cities'
import { toSydneyParts } from '@/lib/event-store-parts'
import { zonedWallTime } from '@/lib/zoned-time'
import { confidence, isSameEvent, normalizeVenue, similarity, sourceLabel } from '@/lib/quality'

export type AvailabilityKind = 'confirmed' | 'soon' | 'possibly' | 'exclude'

export type SlotInput = {
  id?: string
  title?: string
  date: string | Date
  endDate?: string | Date | null
  time?: string | null
  endTime?: string | null
  city?: string | null
  status?: string | null
  duplicateOfId?: string | null
  venueName?: string | null
  organiserName?: string | null
  source?: string | null
  venueOpen?: string | null
  venueClose?: string | null
}

export type WindowOpts = {
  window: 'tonight' | 'now'
  /** YYYY-MM-DD in the city's zone. */
  day: string
  nowMinutes: number
  /** Drop listings whose known finish is already past, when `day` is today. */
  dropEnded?: boolean
}

const TONIGHT_START = 17 * 60

export function dateKeyOf(value: string | Date | null | undefined): string {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
}

export function minutesOf(t?: string | null): number | null {
  const m = t?.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

export function minutesNow(city?: string | null, now = new Date()): number {
  const parts = toSydneyParts(now, cityDef(city).tz)
  return minutesOf(parts.time) ?? 0
}

export function venueKey(city: string, venueName: string): string {
  const name = normalizeVenue(venueName) || venueName.toLowerCase().trim()
  return `${city.toLowerCase()}|${name}`.slice(0, 180)
}

/** Authoritative open/close only. Missing hours are unknown, never invented. */
export function venueHoursFit(start: number | null, open?: string | null, close?: string | null): 'unknown' | 'inside' | 'outside' {
  const o = minutesOf(open)
  const c = minutesOf(close)
  if (o == null || c == null || start == null) return 'unknown'
  if (c > o) return start >= o && start < c ? 'inside' : 'outside'
  return start >= o || start < c ? 'inside' : 'outside'
}

function coversDay(ev: SlotInput, day: string): boolean {
  const start = dateKeyOf(ev.date)
  const end = dateKeyOf(ev.endDate) || start
  return !!start && start <= day && end >= day
}

function blocked(status?: string | null): boolean {
  return !!status && status !== 'SCHEDULED'
}

/** Known finish already passed. Overnight (end before start) is still on. */
function finishedToday(start: number, end: number | null, nowMinutes: number): boolean {
  if (end == null || end <= start) return false
  return nowMinutes >= end
}

/**
 * Tonight: a start at 17:00 or later. Morning and afternoon starts stay off this list,
 * including ones that run past 17:00. Untimed listings are possibly available, after the timed ones.
 * Happening now: a known window that contains this minute is confirmed. A start in the next
 * three hours stays as "soon" so Now & next still works. No end time is possibly available.
 */
export function listingBucket(ev: SlotInput, opts: WindowOpts): AvailabilityKind {
  if (ev.duplicateOfId) return 'exclude'
  if (blocked(ev.status)) return 'exclude'
  if (!coversDay(ev, opts.day)) return 'exclude'
  const start = minutesOf(ev.time)
  const end = minutesOf(ev.endTime)
  const hours = venueHoursFit(start, ev.venueOpen, ev.venueClose)
  if (opts.window === 'tonight') {
    if (start == null) return hours === 'outside' ? 'exclude' : 'possibly'
    if (start < TONIGHT_START) return 'exclude'
    if (opts.dropEnded && finishedToday(start, end, opts.nowMinutes)) return 'exclude'
    if (hours === 'outside') return 'possibly'
    return 'confirmed'
  }
  if (start == null) return 'possibly'
  if (opts.dropEnded && finishedToday(start, end, opts.nowMinutes)) return 'exclude'
  const untilStart = start - opts.nowMinutes
  if (untilStart > 0 && untilStart <= 180) return hours === 'outside' ? 'possibly' : 'soon'
  if (untilStart > 180) return 'exclude'
  if (end != null && end > start && opts.nowMinutes >= start && opts.nowMinutes < end) {
    return hours === 'outside' ? 'possibly' : 'confirmed'
  }
  if (end != null && end <= start && opts.nowMinutes >= start) return hours === 'outside' ? 'possibly' : 'confirmed'
  if (end == null && opts.nowMinutes - start <= 180) return 'possibly'
  return 'exclude'
}

function byStart(a: SlotInput, b: SlotInput): number {
  return (minutesOf(a.time) ?? 24 * 60) - (minutesOf(b.time) ?? 24 * 60) || (a.title ?? '').localeCompare(b.title ?? '')
}

export function rankWindow<T extends SlotInput>(rows: T[], opts: WindowOpts): { confirmed: T[]; soon: T[]; possibly: T[] } {
  const confirmed: T[] = []
  const soon: T[] = []
  const possibly: T[] = []
  for (const row of rows) {
    const bucket = listingBucket(row, opts)
    if (bucket === 'confirmed') confirmed.push(row)
    else if (bucket === 'soon') soon.push(row)
    else if (bucket === 'possibly') possibly.push(row)
  }
  confirmed.sort(byStart)
  soon.sort(byStart)
  possibly.sort(byStart)
  return { confirmed, soon, possibly }
}

/** Confirmed, then soon, then possibly available. Excluded rows are omitted. */
export function orderedWindow<T extends SlotInput>(rows: T[], opts: WindowOpts): T[] {
  const ranked = rankWindow(rows, opts)
  return [...ranked.confirmed, ...ranked.soon, ...ranked.possibly]
}

function organiserAgrees(a?: string | null, b?: string | null): boolean {
  const left = (a ?? '').trim().toLowerCase()
  const right = (b ?? '').trim().toLowerCase()
  if (!left || !right) return true
  if (left === right || left.includes(right) || right.includes(left)) return true
  return similarity(left, right) >= 0.5
}

/** Same real-world listing: title, venue and time, and organiser when both names are present. */
export function sameRealWorldEvent(
  a: { title: string; venueName: string; time?: string | null; source?: string; organiserName?: string | null },
  b: { title: string; venueName: string; time?: string | null; source?: string; organiserName?: string | null },
): boolean {
  if (!isSameEvent(a, b)) return false
  return organiserAgrees(a.organiserName, b.organiserName)
}

/** Fields that disagree but did not block a merge. The kept listing is not overwritten. */
export function fieldConflicts(
  a: { time?: string | null; endTime?: string | null; status?: string | null; venueName?: string | null },
  b: { time?: string | null; endTime?: string | null; status?: string | null; venueName?: string | null },
): string[] {
  const out: string[] = []
  const ta = minutesOf(a.time)
  const tb = minutesOf(b.time)
  if (ta != null && tb != null && ta !== tb) out.push(`time ${a.time} vs ${b.time}`)
  const ea = minutesOf(a.endTime)
  const eb = minutesOf(b.endTime)
  if (ea != null && eb != null && ea !== eb) out.push(`end ${a.endTime} vs ${b.endTime}`)
  const va = normalizeVenue(a.venueName ?? '')
  const vb = normalizeVenue(b.venueName ?? '')
  if (va && vb && va !== vb) out.push(`venue ${a.venueName} vs ${b.venueName}`)
  if (a.status && b.status && a.status !== b.status) out.push(`status ${a.status} vs ${b.status}`)
  return out
}

export type ScheduleInput = SlotInput & {
  isFree?: boolean
  price?: string | null
  priceMin?: number | null
  venueAddress?: string | null
  latitude?: number | null
  lastVerifiedAt?: Date | string | null
  updatedAt?: Date | string | null
  sources?: string[] | null
}

/** Start/end instants in the city zone. All-day listings have no clock time. Confidence is internal. */
export function scheduleFields(ev: ScheduleInput, now = Date.now()) {
  const timezone = cityDef(ev.city).tz
  const key = dateKeyOf(ev.date)
  const startMin = minutesOf(ev.time)
  const allDay = startMin == null
  const startsAt = key ? zonedWallTime(key, allDay ? '00:00' : ev.time!, timezone) : null
  let endsAt: Date | null = null
  const endMin = minutesOf(ev.endTime)
  if (key && endMin != null && ev.endTime) {
    let endKey = dateKeyOf(ev.endDate) || key
    if (!ev.endDate && startMin != null && endMin <= startMin) endKey = addDaysKey(key, 1)
    endsAt = zonedWallTime(endKey, ev.endTime, timezone)
  } else if (key && ev.endDate && dateKeyOf(ev.endDate) > key) {
    endsAt = zonedWallTime(dateKeyOf(ev.endDate), '23:59', timezone)
  }
  const confidenceScore = confidence({
    source: ev.source ?? '',
    sources: ev.sources,
    lastVerifiedAt: ev.lastVerifiedAt,
    updatedAt: ev.updatedAt,
    time: ev.time,
    venueAddress: ev.venueAddress,
    latitude: ev.latitude,
    price: ev.price,
    isFree: ev.isFree === true,
  }, now).score
  return { timezone, allDay, startsAt, endsAt, confidenceScore }
}

export const NEAR_START_WINDOW_MS = 36 * 60 * 60 * 1000
export const RECHECK_STALE_MS = 12 * 60 * 60 * 1000

/** Due when the listing starts within 36 hours and the last check is older than 12 hours. */
export function nearStartPlan(
  lastChecked: Date | string | null | undefined,
  startsAt: Date | string | null | undefined,
  now = Date.now(),
): 'skip' | 'ok' | 'due' {
  if (!startsAt) return 'skip'
  const start = new Date(startsAt).getTime()
  if (!Number.isFinite(start)) return 'skip'
  const until = start - now
  if (until < 0 || until > NEAR_START_WINDOW_MS) return 'skip'
  const seen = lastChecked ? new Date(lastChecked).getTime() : NaN
  if (!Number.isFinite(seen) || now - seen > RECHECK_STALE_MS) return 'due'
  return 'ok'
}

export function formatUpdated(checkedAt: string | Date | null | undefined, now = new Date()): string | null {
  if (!checkedAt) return null
  const d = new Date(checkedAt)
  if (Number.isNaN(d.getTime())) return null
  const zone = 'Australia/Sydney'
  const sameYear = d.toLocaleDateString('en-AU', { year: 'numeric', timeZone: zone }) === now.toLocaleDateString('en-AU', { year: 'numeric', timeZone: zone })
  return d.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: zone,
  })
}

/** Public freshness line. No score and no verification wording. */
export function sourceUpdatedLine(source: string | null | undefined, checkedAt: string | Date | null | undefined, now = new Date()): string {
  const label = sourceLabel(source).replace(/\bverified\b/ig, '').replace(/\s{2,}/g, ' ').trim() || 'a listing site'
  const when = formatUpdated(checkedAt, now)
  return when ? `Source: ${label} · Updated ${when}` : `Source: ${label}`
}

export function reportsPerThousand(reports: number, views: number): number | null {
  if (!Number.isFinite(views) || views <= 0) return null
  if (!Number.isFinite(reports) || reports < 0) return null
  return Math.round((reports / views) * 1000 * 10) / 10
}

export function refreshSuccessRate(completed: number, failed: number): number | null {
  const ok = Number.isFinite(completed) && completed > 0 ? completed : 0
  const bad = Number.isFinite(failed) && failed > 0 ? failed : 0
  const total = ok + bad
  if (!total) return null
  return Math.round((ok / total) * 1000) / 10
}

/** A source whose two latest chunk logs both have a hard error. Budget stops are not failures. */
export function repeatedSourceFailures(logs: { status: string; errors: string | null; startedAt: string | Date }[]): string[] {
  const sorted = [...logs].sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt))
  const by = new Map<string, { errors: string | null }[]>()
  for (const log of sorted) {
    if (!log.status.startsWith('source:')) continue
    const name = log.status.slice('source:'.length)
    const list = by.get(name) ?? []
    if (list.length < 2) list.push(log)
    by.set(name, list)
  }
  const out: string[] = []
  for (const [name, list] of by) {
    if (list.length < 2) continue
    const hard = list.every((row) => !!row.errors && !/time budget/i.test(row.errors))
    if (hard) out.push(name)
  }
  return out
}
