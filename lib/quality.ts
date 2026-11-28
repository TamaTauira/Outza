/**
 * Event data-quality rules shared by ingestion, ranking and the UI.
 * Pure functions only, so the module is safe to import on the client.
 *
 * Listing completeness is `outzaVerified` below. It stays in the API for ranking
 * and checks. Do not show it as a Verified badge.
 */
import { CITIES } from '@/lib/cities'
import { boardClockLine, resolveSchedule } from '@/lib/listing-window'
import { cityToday } from '@/lib/seo'
import { PRICE_SUPPRESS_ABOVE, readPrice } from '@/lib/price'

export type EventStatus = 'SCHEDULED' | 'CANCELLED' | 'POSTPONED' | 'RESCHEDULED' | 'SOLD_OUT'
export type Recurrence = 'DAILY' | 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' | 'RECURRING'

/** Where a listing came from and how much we trust it as a source of truth. */
export const SOURCES: Record<string, { label: string; kind: 'organiser' | 'official' | 'ticketing'; trust: number }> = {
  promoter: { label: 'the organiser', kind: 'organiser', trust: 45 },
  cityofsydney: { label: 'City of Sydney', kind: 'official', trust: 40 },
  brisbanecouncil: { label: 'Brisbane City Council', kind: 'official', trust: 40 },
  frontier: { label: 'Frontier Touring', kind: 'organiser', trust: 40 },
  curated: { label: 'the organiser’s official schedule', kind: 'official', trust: 36 },
  ticketmaster: { label: 'Ticketmaster', kind: 'ticketing', trust: 32 },
  humanitix: { label: 'Humanitix', kind: 'ticketing', trust: 30 },
  moshtix: { label: 'Moshtix', kind: 'ticketing', trust: 30 },
  oztix: { label: 'Oztix', kind: 'ticketing', trust: 30 },
  ticketek: { label: 'Ticketek', kind: 'ticketing', trust: 32 },
  eventbrite: { label: 'Eventbrite', kind: 'ticketing', trust: 26 },
  community: { label: 'the organiser', kind: 'organiser', trust: 40 },
}
export const sourceLabel = (s?: string | null) => (s && SOURCES[s]?.label) || s || 'a listing site'

/** Confidence line. Curated listings must not read "From the official the organiser's…". */
export function sourceReason(source?: string | null): string {
  if (source === 'curated') return 'From the organiser’s official schedule'
  const src = source ? SOURCES[source] : undefined
  if (!src) return `From ${sourceLabel(source)}`
  if (src.kind === 'organiser') return src.label === 'the organiser' ? 'Listed directly by the organiser' : `Listed directly by ${src.label}`
  if (src.kind === 'official') return `From the official ${src.label} guide`
  return `From ${src.label}`
}

/** True when a listing has a real price, even if isFree was set by mistake. */
export function isPaidListing(ev: { price?: string | null; priceMin?: number | null }): boolean {
  if (typeof ev.priceMin === 'number' && ev.priceMin > 0.009) return true
  const p = (ev.price ?? '').replace(/,/g, '').trim()
  if (!p) return false
  if (/^\s*[-−]/.test(p)) return false
  if (/^(free|complimentary|no charge|gratis|\$0(?:\.00)?|0(?:\.00)?)$/i.test(p)) return false
  return /\$\s*[1-9]/.test(p)
}

/** "Run" and "Run/Walk" are the same listing once the activity words are stripped. */
export function activityTitle(t: string): string {
  return normalizeTitle(t).replace(/\b(run|walk|running|walking)\b/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Listings hidden because they were merged into another listing. */
export const LISTABLE = { duplicateOfId: null } as const

const TITLE_NOISE = /\b(live|tickets?|presents?|the|and|tour|australian|australia|world|show|concert|in concert|official|20\d\d)\b/g

export function normalizeTitle(t: string): string {
  return t
    .normalize('NFKD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[|–—:].*$/, (m) => (m.length > 40 ? '' : m)) // drop long "| venue / city" tails
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(TITLE_NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeVenue(v: string): string {
  return v
    .normalize('NFKD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/theater/g, 'theatre')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(the|venue|sydney|melbourne|brisbane|perth|adelaide|hobart|canberra|darwin|nsw|vic|qld|wa|sa|tas|act|nt)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(s: string) {
  return new Set(s.split(' ').filter((w) => w.length > 1))
}

/** Token similarity 0–1; a short title fully contained in a longer one scores high. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const A = tokens(a)
  const B = tokens(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const w of A) if (B.has(w)) inter++
  const jaccard = inter / (A.size + B.size - inter)
  const contain = inter / Math.min(A.size, B.size)
  return Math.min(A.size, B.size) >= 2 && contain === 1 ? Math.max(jaccard, 0.9) : jaccard
}

const mins = (t?: string | null) => {
  const m = t?.match(/^(\d{1,2}):(\d{2})/)
  return m ? +m[1] * 60 + +m[2] : null
}

type Listing = { title: string; venueName: string; time?: string | null; source?: string }

/**
 * Two listings on the same date and city: are they the same real-world event?
 * Within one source, distinct listings are usually distinct products, so only near-identical ones match.
 */
export function isSameEvent(a: Listing, b: Listing): boolean {
  const ts = similarity(normalizeTitle(a.title), normalizeTitle(b.title))
  const vs = similarity(normalizeVenue(a.venueName), normalizeVenue(b.venueName))
  const ta = mins(a.time)
  const tb = mins(b.time)
  const timeOk = ta === null || tb === null || Math.abs(ta - tb) <= 45
  if (!timeOk) return false
  const aa = activityTitle(a.title)
  const bb = activityTitle(b.title)
  if (aa && aa === bb && (vs >= 0.34 || !normalizeVenue(a.venueName) || !normalizeVenue(b.venueName))) return true
  if (a.source && a.source === b.source) {
    const exactTitle = normalizeTitle(a.title) === normalizeTitle(b.title) && a.title.trim().toLowerCase() === b.title.trim().toLowerCase()
    return exactTitle && vs >= 0.5 && ta === tb
  }
  if (ts >= 0.85) return vs >= 0.34 || !normalizeVenue(a.venueName) || !normalizeVenue(b.venueName) || ts === 1
  return ts >= 0.6 && vs >= 0.5
}

/** Parses "$25 - $80", "From $30", "Free", "$1,250" into a numeric range. Does not invent a number. */
export function parsePriceRange(isFree: boolean, price?: string | null): { min: number | null; max: number | null } {
  if (isFree) return { min: 0, max: 0 }
  const r = readPrice(price)
  return { min: r.min, max: r.max }
}

/** Promoters can edit events they created. Ingested listings stay as the source published them. */
export function promoterCanEditEvent(source: string | null | undefined): boolean {
  return source === 'promoter' || source === 'community'
}

const money = (n: number) => (n === 0 ? 'Free' : `$${Number.isInteger(n) ? n : n.toFixed(2)}`)

/** Noted beside the price when a free class is pooled with paid classes. The free tickets are never the headline. */
export const FREE_TICKETS_NOTE = 'Free tickets available'

/** Human price range plus an honest note about booking fees. Free entry, 0 and $0 are free — no booking-fee line. */
export function priceSummary(ev: { isFree: boolean; price?: string | null; priceMin?: number | null; priceMax?: number | null; feesIncluded?: boolean | null }) {
  const read = readPrice(ev.price)
  const lo = ev.priceMin ?? read.min
  const hi = ev.priceMax ?? read.max ?? lo
  // A positive amount anywhere — string or columns — means the listing is not
  // free as a whole, whatever the isFree flag or a $0 minimum says.
  const paid = isPaidListing(ev) || (hi != null && hi > 0)
  if (!paid && (ev.isFree || (ev.priceMin != null && ev.priceMin <= 0) || read.isFree)) return { range: 'Free', fees: null as string | null, freeNote: null as string | null }
  const fees = ev.feesIncluded === true ? 'Includes booking fees' : 'Booking fees may apply at checkout'
  // A free class pooled with paid classes leads with the paid amount the range
  // can stand behind; the free tickets are noted, never headlined, and never
  // rendered as a "Free – $X" range.
  if (lo === 0 && hi != null && hi > 0) {
    if (hi > PRICE_SUPPRESS_ABOVE) return { range: 'Price not published', fees: null as string | null, freeNote: null as string | null }
    return { range: `From ${money(hi)}`, fees, freeNote: FREE_TICKETS_NOTE }
  }
  const r = ev.priceMin != null && ev.priceMin > 0 ? { min: ev.priceMin, max: ev.priceMax ?? ev.priceMin } : parsePriceRange(false, ev.price)
  if (r.min == null || r.min <= 0 || (r.max ?? r.min) > PRICE_SUPPRESS_ABOVE) return { range: 'Price not published', fees: null as string | null, freeNote: null as string | null }
  const fromLabel = /\bfrom\b/i.test(ev.price ?? '') && (r.max == null || r.max === r.min)
  const range = r.max != null && r.max !== r.min ? `${money(r.min)} – ${money(r.max)}` : fromLabel ? `From ${money(r.min)}` : money(r.min)
  return { range, fees, freeNote: null as string | null }
}

/** Infers a repeat pattern from the gaps (in days) between upcoming dates of one series. */
export function inferRecurrence(dates: string[]): Recurrence | null {
  const days = [...new Set(dates)].sort().map((d) => Date.parse(`${d}T00:00:00Z`) / 86400000)
  if (days.length < 3) return null
  const gaps = days.slice(1).map((d, i) => d - days[i]).sort((a, b) => a - b)
  const g = gaps[Math.floor(gaps.length / 2)]
  if (g === 1) return 'DAILY'
  if (g === 7) return 'WEEKLY'
  if (g === 14) return 'FORTNIGHTLY'
  if (g >= 28 && g <= 31) return 'MONTHLY'
  return 'RECURRING'
}

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  DAILY: 'Daily', WEEKLY: 'Weekly', FORTNIGHTLY: 'Fortnightly', MONTHLY: 'Monthly', RECURRING: 'Recurring',
}

export type Confidence = { score: number; level: 'high' | 'medium' | 'low'; reasons: string[] }

type ConfidenceInput = {
  source: string
  sources?: string[] | null
  lastVerifiedAt?: Date | string | null
  updatedAt?: Date | string | null
  time?: string | null
  venueAddress?: string | null
  latitude?: number | null
  price?: string | null
  isFree: boolean
  promoterVerified?: boolean
}

/**
 * Internal confidence score (0–100): who confirmed the listing, how recently,
 * whether several sources agree, and how complete the details are.
 */
export function confidence(ev: ConfidenceInput, now = Date.now()): Confidence {
  const reasons: string[] = []
  const src = SOURCES[ev.source]
  let score = src?.trust ?? 20
  reasons.push(sourceReason(ev.source))
  if (ev.source === 'promoter' && ev.promoterVerified) { score += 5; reasons.push('Promoter Pro is current') }

  const seen = ev.lastVerifiedAt ?? ev.updatedAt
  const ageH = seen ? (now - new Date(seen).getTime()) / 3600000 : Infinity
  if (ageH <= 24) score += 30
  else if (ageH <= 72) score += 20
  else if (ageH <= 168) score += 10
  if (ageH > 168) reasons.push('Not re-confirmed in the last week')
  else if (ev.source !== 'promoter') reasons.push(ageH <= 24 ? 'Re-confirmed in the last 24 hours' : 'Re-confirmed this week')

  const others = new Set((ev.sources ?? []).filter((s) => s !== ev.source))
  if (others.size) { score += Math.min(10, others.size * 5); reasons.push(`Also listed on ${[...others].map(sourceLabel).join(', ')}`) }

  let complete = 0
  if (ev.time) complete += 5
  if (ev.venueAddress || ev.latitude != null) complete += 5
  if (ev.isFree || ev.price) complete += 5
  score += complete
  if (complete < 15) reasons.push('Some details (time, address or price) are missing')

  score = Math.max(0, Math.min(100, Math.round(score)))
  return { score, level: score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low', reasons }
}

/** Popularity used for ranking: community actions weigh more than passive views. */
export function popularity(ev: { saves?: number; attendees?: number; views?: number; ticketClicks?: number; sources?: string[] | null; imageUrl?: string | null }) {
  return (ev.saves ?? 0) * 3 + (ev.attendees ?? 0) * 3 + Math.min(ev.ticketClicks ?? 0, 100) / 5 + Math.min(ev.views ?? 0, 200) / 20 +
    Math.max(0, (ev.sources?.length ?? 1) - 1) + (ev.imageUrl ? 1 : 0)
}

/**
 * Completeness check used behind the scenes. Every line must be true. If a check
 * cannot be run (for example open reports were not loaded), the check fails.
 *
 * 1. Not linked as a duplicate (`duplicateOfId` is empty).
 * 2. Status is SCHEDULED. Cancelled, postponed, rescheduled, and reported sold out fail.
 * 3. The last day (end date, else start date) is still today or later in the event's city.
 * 4. `lastVerifiedAt` is within the last 7 days. Ingest refreshes and organiser edits set this.
 * 5. Required fields: title, date, a start time, a specific venue name (not the city or "TBA"),
 *    city, a price or an explicit free flag, and an http(s) organiser, source or ticket link.
 * 6. `source` is a known VibePeep source (organiser, official guide, or ticketing partner).
 * 7. No OPEN correction report for duplicate, wrong date, wrong venue, or cancelled.
 *    Wrong price, broken link, and "something else" do not by themselves fail the check.
 */
export const VERIFIED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export const VERIFIED_BLOCKING_REPORTS = ['DUPLICATE', 'WRONG_DATE', 'WRONG_VENUE', 'CANCELLED'] as const

const GENERIC_VENUE = /^(tba|tbc|venue tba|online|virtual|various|multiple venues|cbd|city|australia)$/i

export type VerifiedInput = {
  title?: string | null
  date?: Date | string | null
  endDate?: Date | string | null
  time?: string | null
  venueName?: string | null
  city?: string | null
  isFree?: boolean
  price?: string | null
  priceMin?: number | null
  ticketUrl?: string | null
  sourceUrl?: string | null
  organiserUrl?: string | null
  source?: string | null
  status?: string | null
  duplicateOfId?: string | null
  lastVerifiedAt?: Date | string | null
  /** Pass an array (possibly empty). Omit it and the listing stays unverified. */
  openReportReasons?: string[] | null
}

export function outzaVerified(ev: VerifiedInput, now = Date.now()): { ok: boolean; missing: string[] } {
  const missing: string[] = []
  if (ev.duplicateOfId) missing.push('Marked as a duplicate of another listing')
  if ((ev.status ?? 'SCHEDULED') !== 'SCHEDULED') missing.push('Status is not scheduled')
  const last = ev.endDate ?? ev.date
  if (!ev.date || !last) missing.push('No date')
  else {
    const key = (typeof last === 'string' ? last : last.toISOString()).slice(0, 10)
    const city = CITIES.find((c) => c.name === ev.city) ?? CITIES[0]
    if (key < cityToday(city, new Date(now))) missing.push('Listing is before today in its city')
  }
  const seen = ev.lastVerifiedAt ? new Date(ev.lastVerifiedAt).getTime() : NaN
  if (!Number.isFinite(seen) || now - seen > VERIFIED_MAX_AGE_MS) missing.push('Not re-confirmed in the last 7 days')
  if (!ev.title?.trim()) missing.push('Title is missing')
  if (!ev.time || !/^\d{1,2}:\d{2}/.test(ev.time)) missing.push('Start time is missing')
  const venue = (ev.venueName ?? '').trim()
  const genericVenue = !venue || GENERIC_VENUE.test(venue) || (!!ev.city && venue.toLowerCase() === ev.city.trim().toLowerCase())
  if (genericVenue) missing.push('Venue name is missing or too vague')
  if (!ev.city?.trim()) missing.push('City is missing')
  const priced = ev.isFree === true || (typeof ev.priceMin === 'number' && ev.priceMin >= 0) || !!(ev.price && ev.price.trim())
  if (!priced) missing.push('Price is not listed and the event is not marked free')
  const link = ev.organiserUrl || ev.ticketUrl || ev.sourceUrl || ''
  if (!/^https?:\/\//i.test(link)) missing.push('No organiser, source or ticket link')
  if (!ev.source || !SOURCES[ev.source]) missing.push('Source is not a known VibePeep source')
  // A listing the organiser just typed has not been re-checked against a source feed.
  if (ev.source === 'promoter') missing.push('Listed by the organiser, not re-checked against a source feed')
  if (!Array.isArray(ev.openReportReasons)) missing.push('Open correction reports were not checked')
  else if (ev.openReportReasons.some((r) => (VERIFIED_BLOCKING_REPORTS as readonly string[]).includes(r))) missing.push('An open correction report is still open')
  return { ok: missing.length === 0, missing }
}

/** What we can honestly say about the schedule. A finish earlier than the start is hidden unless it is a real next-morning close. */
export function scheduleCue(ev: { time?: string | null; endTime?: string | null; endDate?: Date | string | null; date?: Date | string | null }): { label: string; detail: string } {
  const start = ev.time && /^\d{1,2}:\d{2}/.test(ev.time)
  const end = ev.endTime && /^\d{1,2}:\d{2}/.test(ev.endTime)
  const startKey = ev.date ? (typeof ev.date === 'string' ? ev.date : ev.date.toISOString()).slice(0, 10) : ''
  const endKey = ev.endDate ? (typeof ev.endDate === 'string' ? ev.endDate : ev.endDate.toISOString()).slice(0, 10) : ''
  const sched = resolveSchedule({ date: ev.date ?? (startKey || '1970-01-01'), endDate: ev.endDate, time: ev.time, endTime: ev.endTime }, startKey || '1970-01-01')
  const clock = boardClockLine({ date: ev.date ?? (startKey || '1970-01-01'), endDate: ev.endDate, time: ev.time, endTime: ev.endTime })
  if (sched.bogusEnd) {
    const dates = multiDayRange(startKey, endKey)
    return { label: 'Finish time looks off', detail: `${clock ?? 'The start is listed'}.${dates} The source finish is earlier than the start, so it is not shown. Confirm the finish with the organiser.` }
  }
  const multi = sched.multiDay || !!(startKey && endKey && endKey > startKey)
  if (start && end && (sched.overnight || multi)) {
    const formatted = clock ?? `${ev.time} – ${ev.endTime}`
    const tail = sched.overnight && !formatted.includes('until ') ? `${formatted} the next day` : formatted
    return { label: multi ? 'More than one day' : 'Runs past midnight', detail: `${tail}. Confirm the finish with the organiser if the time looks off.` }
  }
  if (start && end) return { label: 'Start and finish listed', detail: `${clock ?? `${ev.time} – ${ev.endTime}`}. Confirm with the organiser if the time looks off.` }
  if (multi) return { label: 'More than one day', detail: `Runs from ${auDay(startKey)} to ${auDay(endKey)}.` }
  if (start) return { label: 'Start time listed', detail: `${clock ?? ev.time}. A finish time was not on the source listing.` }
  return { label: 'Start time not listed', detail: 'The source did not include a start time. Check the organiser before you go.' }
}

const AU_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function auDay(key: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key
  const [year, month, day] = key.split('-').map(Number)
  return `${day} ${AU_MONTHS[month - 1]} ${year}`
}

function multiDayRange(startKey: string, endKey: string): string {
  if (!startKey || !endKey || endKey <= startKey) return ''
  return ` Runs from ${auDay(startKey)} to ${auDay(endKey)}.`
}

/** A one-day gap is a short run, not an every-day event. "Daily" stays off the public page. */
export function publicRecurrenceLabel(recurrence: string | null | undefined): string | null {
  if (!recurrence || recurrence === 'DAILY' || !(recurrence in RECURRENCE_LABEL)) return null
  return RECURRENCE_LABEL[recurrence as Recurrence]
}

/**
 * Availability is never presented as a live ticket count.
 * A reported status is attributed. Otherwise we say it is not confirmed live.
 */
export function availabilityLine(status?: string | null, statusSource?: string | null): { label: string; note: string } {
  const reported = statusInfo(status, statusSource)
  if (reported) return { label: reported.label, note: reported.note }
  return { label: 'Not confirmed live', note: 'VibePeep does not show live ticket availability. Check the organiser or ticket seller before you go.' }
}

/** Short, honest status wording. Availability is always attributed and never presented as live. */
export function statusInfo(status?: string | null, statusSource?: string | null): { label: string; tone: 'bad' | 'warn'; note: string } | null {
  const by = statusSource ? ` by ${sourceLabel(statusSource)}` : ''
  switch (status) {
    case 'CANCELLED': return { label: 'Cancelled', tone: 'bad', note: `Reported cancelled${by}. Check with the organiser about refunds.` }
    case 'POSTPONED': return { label: 'Postponed', tone: 'warn', note: `Reported postponed${by}. A new date hasn't been confirmed yet.` }
    case 'RESCHEDULED': return { label: 'Rescheduled', tone: 'warn', note: `Reported rescheduled${by}. Check the new date before you go.` }
    case 'SOLD_OUT': return { label: 'Reported sold out', tone: 'warn', note: `Reported sold out${by} when we last checked. Resale or released tickets may still appear.` }
    default: return null
  }
}
