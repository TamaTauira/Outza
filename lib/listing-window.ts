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
  /** Schema flag: the source listed no clock time. A sentinel midnight clock is not this. */
  allDay?: boolean | null
  startsAt?: string | Date | null
  endsAt?: string | Date | null
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

const SOON_MINUTES = 180
/** A finish at or before this, after a daytime start, is the next morning — not a clock that ran backwards. */
const NEXT_MORNING = 8 * 60
/** Open-all-day encodings from guides: midnight through 10pm or later, with no real session start. */
const OPEN_DAY_END = 22 * 60

function daySpan(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
}

export type ResolvedSchedule = {
  /** Minute of the start clock. Null when the source listed no time. */
  start: number | null
  /** Finish, in minutes from the start date's local midnight. Past 1440 means a later day. */
  end: number | null
  /** No clock, or a midnight-to-late encoding. These must not lead a timed list. */
  dropIn: boolean
  overnight: boolean
  /** End clock is earlier than the start and is not a real next-day finish. Hide it. */
  bogusEnd: boolean
  multiDay: boolean
  endKey: string | null
}

/**
 * Wall-clock window for one listing on `day`, in the event's city.
 * An end clock earlier than the start is the next day only when that reading is plausible
 * (evening into the next morning, a 24-hour window stored as one minute short, or an end date).
 * A morning class stored as 6:15am–6:00am is a bad finish, not an all-night session.
 */
export function resolveSchedule(ev: SlotInput, day: string): ResolvedSchedule {
  const startKey = dateKeyOf(ev.date) || day
  const endDateKey = dateKeyOf(ev.endDate)
  let start = minutesOf(ev.time)
  let endClock = minutesOf(ev.endTime)

  if (start == null && ev.allDay !== true && ev.startsAt) {
    const zone = cityDef(ev.city).tz
    const parts = toSydneyParts(new Date(ev.startsAt), zone)
    if (parts.date === startKey || parts.date === day) start = minutesOf(parts.time)
    if (endClock == null && ev.endsAt) {
      const endParts = toSydneyParts(new Date(ev.endsAt), zone)
      const mins = minutesOf(endParts.time)
      const span = daySpan(parts.date, endParts.date)
      if (mins != null && span >= 0 && span < 14) endClock = mins + span * 1440
    }
  }

  const multiDay = !!(endDateKey && startKey && endDateKey > startKey)
  const openDay = start === 0 && endClock != null && endClock >= OPEN_DAY_END && endClock < 1440
  const dropIn = start == null || openDay

  if (dropIn) {
    const end = start == null
      ? (multiDay ? daySpan(startKey, endDateKey) * 1440 + (endClock ?? 24 * 60) : (endClock != null && endClock > 0 ? endClock : 24 * 60))
      : endClock
    return { start: start == null ? null : 0, end, dropIn: true, overnight: false, bogusEnd: false, multiDay, endKey: multiDay ? endDateKey : null }
  }

  let overnight = false
  let bogusEnd = false
  let end: number | null = endClock
  let endKey: string | null = multiDay ? endDateKey : null

  if (start != null && endClock != null && endClock <= start) {
    const spanDays = multiDay ? daySpan(startKey, endDateKey) : 0
    const intoNextMorning = start >= 10 * 60 && endClock <= NEXT_MORNING
    const almostDay = endClock === start - 1
    if (endClock === start && spanDays === 0) {
      bogusEnd = true
      end = null
      endKey = null
    } else if (intoNextMorning || almostDay || spanDays > 0) {
      overnight = true
      const days = spanDays > 0 ? spanDays : 1
      end = endClock + days * 1440
      endKey = spanDays > 0 ? endDateKey : addDaysKey(startKey, 1)
    } else {
      bogusEnd = true
      end = null
      endKey = null
    }
  }

  return { start, end, dropIn: false, overnight, bogusEnd, multiDay, endKey }
}

/** The known finish is already past. A missing finish counts as over three hours after the start. */
export function scheduleFinished(sched: ResolvedSchedule, nowMinutes: number): boolean {
  if (sched.end != null) return nowMinutes >= sched.end
  if (sched.dropIn || sched.start == null) return false
  return nowMinutes - sched.start > SOON_MINUTES
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function clockParts(mins: number): { hm: string; ampm: string } {
  const m = ((mins % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const min = m % 60
  return { hm: `${h % 12 === 0 ? 12 : h % 12}:${String(min).padStart(2, '0')}`, ampm: h < 12 ? 'am' : 'pm' }
}

function shortDate(key: string): string {
  const d = new Date(`${key}T00:00:00Z`)
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`
}

export type BoardRange = {
  hm: string
  ampm: string
  /** Finish clock, e.g. "– 1:00 am". Null when there is no end to show. */
  endLine: string | null
  /** Calendar note under the finish. Null for a same-day or same-night finish. */
  endNote: string | null
  label: string
}

/** A finish before 6am the next morning is still that night. The board shows the clock only. */
const SAME_NIGHT_BEFORE = 6 * 60

function shownFinish(ev: SlotInput, sched: ResolvedSchedule, endClockLabel: string): { endLabel: string; endNote: string | null } {
  const clockOnly = { endLabel: endClockLabel, endNote: null as string | null }
  if (!sched.endKey || sched.end == null || sched.start == null) return clockOnly
  const startKey = dateKeyOf(ev.date)
  const span = startKey ? daySpan(startKey, sched.endKey) : 0
  const endClock = ((sched.end % 1440) + 1440) % 1440
  // Overnight windows already store the finish past midnight. A later calendar day with a later clock does not.
  const duration = sched.overnight ? sched.end - sched.start : sched.end - sched.start + Math.max(0, span) * 1440
  if (span <= 1 && endClock < SAME_NIGHT_BEFORE) return clockOnly
  const longStay = span > 1 || duration >= 24 * 60 - 1
  if (!longStay) return clockOnly
  if (sched.overnight && span <= 1) {
    const note = shortDate(sched.endKey)
    return { endLabel: `${endClockLabel}, ${note}`, endNote: note }
  }
  const note = `until ${shortDate(sched.endKey)}`
  return { endLabel: `${endClockLabel} · ${note}`, endNote: note }
}

/** Start, and a finish that is never drawn earlier than the start. Same-night finishes omit the next date. */
export function formatBoardRange(ev: SlotInput): BoardRange {
  const key = dateKeyOf(ev.date) || '1970-01-01'
  const sched = resolveSchedule(ev, key)
  if (sched.start == null) return { hm: '--:--', ampm: '', endLine: null, endNote: null, label: 'Time not listed' }
  const start = clockParts(sched.start)
  const startLabel = `${start.hm} ${start.ampm}`
  const startOnly = { hm: start.hm, ampm: start.ampm, endLine: null, endNote: null, label: startLabel }
  if (sched.end == null || sched.bogusEnd) return startOnly
  if ((sched.end % 1440) <= sched.start && !sched.endKey) return startOnly
  const end = clockParts(sched.end)
  const clock = `${end.hm} ${end.ampm}`
  const finish = shownFinish(ev, sched, clock)
  return { hm: start.hm, ampm: start.ampm, endLine: `– ${clock}`, endNote: finish.endNote, label: `${startLabel} – ${finish.endLabel}` }
}

export type LiveTone = 'live' | 'soon' | 'later' | 'done' | 'upcoming' | 'tbc'

/** Row status from the same window the board uses to filter. No score and no verification wording. */
export function liveStatus(ev: SlotInput, day: string, today: string | null, nowMin: number): { label: string; tone: LiveTone } {
  const sched = resolveSchedule(ev, day)
  if (!today || day !== today) {
    if (sched.dropIn || sched.start == null) return { label: 'All day', tone: 'tbc' }
    return { label: 'Upcoming', tone: 'upcoming' }
  }
  if (sched.dropIn) {
    if (scheduleFinished(sched, nowMin)) return { label: 'Ended', tone: 'done' }
    return { label: 'All day', tone: 'tbc' }
  }
  if (sched.start == null) return { label: 'All day', tone: 'tbc' }
  if (scheduleFinished(sched, nowMin)) return { label: 'Ended', tone: 'done' }
  if (nowMin >= sched.start) return { label: 'On now', tone: 'live' }
  const diff = sched.start - nowMin
  if (diff <= 60) return { label: `In ${diff} min`, tone: 'soon' }
  if (diff < SOON_MINUTES) return { label: `In ${Math.floor(diff / 60)}h ${diff % 60}m`, tone: 'later' }
  return { label: 'Later today', tone: 'later' }
}

/**
 * Tonight: a start at 17:00 or later. Morning and afternoon starts stay off this list,
 * including ones that run past 17:00. Untimed listings are possibly available, after the timed ones.
 * Happening now: a known window that contains this minute is confirmed. A start in the next
 * three hours stays as "soon". No end time is possibly available. A bad earlier finish is not "still on".
 */
export function listingBucket(ev: SlotInput, opts: WindowOpts): AvailabilityKind {
  if (ev.duplicateOfId) return 'exclude'
  if (blocked(ev.status)) return 'exclude'
  if (!coversDay(ev, opts.day)) return 'exclude'
  const sched = resolveSchedule(ev, opts.day)
  const hours = venueHoursFit(sched.dropIn ? null : sched.start, ev.venueOpen, ev.venueClose)
  const now = opts.nowMinutes
  if (opts.window === 'tonight') {
    if (sched.start == null) return hours === 'outside' ? 'exclude' : 'possibly'
    if (sched.start < TONIGHT_START) return 'exclude'
    if (opts.dropEnded && scheduleFinished(sched, now)) return 'exclude'
    if (hours === 'outside') return 'possibly'
    return 'confirmed'
  }
  if (sched.dropIn) {
    if (opts.dropEnded && scheduleFinished(sched, now)) return 'exclude'
    if (sched.end == null || now < sched.end) return 'confirmed'
    return 'exclude'
  }
  if (sched.start == null) return 'possibly'
  if (opts.dropEnded && scheduleFinished(sched, now)) return 'exclude'
  const untilStart = sched.start - now
  if (untilStart > 0 && untilStart <= SOON_MINUTES) return hours === 'outside' ? 'possibly' : 'soon'
  if (untilStart > SOON_MINUTES) return 'exclude'
  if (sched.end != null && now < sched.end) return hours === 'outside' ? 'possibly' : 'confirmed'
  if (sched.end == null && now - sched.start <= SOON_MINUTES) return 'possibly'
  return 'exclude'
}

function byStart(a: SlotInput, b: SlotInput, day = ''): number {
  const as = resolveSchedule(a, day || dateKeyOf(a.date)).start ?? 24 * 60
  const bs = resolveSchedule(b, day || dateKeyOf(b.date)).start ?? 24 * 60
  return as - bs || (a.title ?? '').localeCompare(b.title ?? '')
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
  const sort = (a: T, b: T) => byStart(a, b, opts.day)
  confirmed.sort(sort)
  soon.sort(sort)
  possibly.sort(sort)
  return { confirmed, soon, possibly }
}

export type RankedBoard<T> = {
  /** Timed events on now, or tonight's confirmed starts. Latest-relevant first is the caller's section order. */
  lead: T[]
  soon: T[]
  /** Still overlapping, but started well before this window. Kept below the lead so morning sessions don't crowd it. */
  still: T[]
  /** Open-all-day listings that cover this minute. */
  allday: T[]
  possibly: T[]
}

/**
 * Now & next: confirmed overlap and the next three hours lead. Long-running daytime sessions
 * and midnight-to-late listings sit in their own groups. Tonight stays a 5pm start.
 */
export function rankBoard<T extends SlotInput>(rows: T[], opts: WindowOpts): RankedBoard<T> {
  const lead: T[] = []
  const soon: T[] = []
  const still: T[] = []
  const allday: T[] = []
  const possibly: T[] = []
  for (const row of rows) {
    const bucket = listingBucket(row, opts)
    if (bucket === 'exclude') continue
    if (bucket === 'possibly') { possibly.push(row); continue }
    if (bucket === 'soon') { soon.push(row); continue }
    const sched = resolveSchedule(row, opts.day)
    if (opts.window === 'now' && sched.dropIn) { allday.push(row); continue }
    if (opts.window === 'now' && sched.start != null && opts.nowMinutes - sched.start > SOON_MINUTES) {
      still.push(row)
      continue
    }
    lead.push(row)
  }
  const sort = (a: T, b: T) => byStart(a, b, opts.day)
  lead.sort(sort)
  soon.sort(sort)
  // Latest start first, so a long afternoon session sits above a morning one.
  still.sort((a, b) => sort(b, a))
  allday.sort(sort)
  possibly.sort(sort)
  return { lead, soon, still, allday, possibly }
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

function hhmmFromMinutes(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Start/end instants in the city zone. All-day listings have no clock time. Confidence is internal. */
export function scheduleFields(ev: ScheduleInput, now = Date.now()) {
  const timezone = cityDef(ev.city).tz
  const key = dateKeyOf(ev.date)
  const startMin = minutesOf(ev.time)
  const allDay = startMin == null
  const startsAt = key ? zonedWallTime(key, allDay ? '00:00' : ev.time!, timezone) : null
  let endsAt: Date | null = null
  const sched = key ? resolveSchedule(ev, key) : null
  if (key && sched && !allDay && sched.end != null && !sched.bogusEnd) {
    const endKey = sched.multiDay && !sched.overnight && sched.endKey
      ? sched.endKey
      : addDaysKey(key, Math.floor(sched.end / 1440))
    endsAt = zonedWallTime(endKey, hhmmFromMinutes(sched.end), timezone)
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
