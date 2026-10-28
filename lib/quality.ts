/**
 * Event data-quality rules shared by ingestion, ranking and the UI.
 * Pure functions only, so the module is safe to import on the client.
 */

export type EventStatus = 'SCHEDULED' | 'CANCELLED' | 'POSTPONED' | 'RESCHEDULED' | 'SOLD_OUT'
export type Recurrence = 'DAILY' | 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' | 'RECURRING'

/** Where a listing came from and how much we trust it as a source of truth. */
export const SOURCES: Record<string, { label: string; kind: 'organiser' | 'official' | 'ticketing'; trust: number }> = {
  promoter: { label: 'the organiser', kind: 'organiser', trust: 45 },
  cityofsydney: { label: 'City of Sydney', kind: 'official', trust: 40 },
  frontier: { label: 'Frontier Touring', kind: 'organiser', trust: 40 },
  curated: { label: 'the organiser’s official schedule', kind: 'official', trust: 36 },
  ticketmaster: { label: 'Ticketmaster', kind: 'ticketing', trust: 32 },
  humanitix: { label: 'Humanitix', kind: 'ticketing', trust: 30 },
  moshtix: { label: 'Moshtix', kind: 'ticketing', trust: 30 },
  oztix: { label: 'Oztix', kind: 'ticketing', trust: 30 },
  ticketek: { label: 'Ticketek', kind: 'ticketing', trust: 32 },
  eventbrite: { label: 'Eventbrite', kind: 'ticketing', trust: 26 },
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

/** Parses "$25 - $80", "From $30", "Free" into a numeric range. */
export function parsePriceRange(isFree: boolean, price?: string | null): { min: number | null; max: number | null } {
  if (isFree) return { min: 0, max: 0 }
  if (!price) return { min: null, max: null }
  const nums = (price.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite)
  if (!nums.length) return /free/i.test(price) ? { min: 0, max: 0 } : { min: null, max: null }
  return { min: Math.min(...nums), max: Math.max(...nums) }
}

const money = (n: number) => (n === 0 ? 'Free' : `$${Number.isInteger(n) ? n : n.toFixed(2)}`)

/** Human price range plus an honest note about booking fees. */
export function priceSummary(ev: { isFree: boolean; price?: string | null; priceMin?: number | null; priceMax?: number | null; feesIncluded?: boolean | null }) {
  if (ev.isFree) return { range: 'Free', fees: null as string | null }
  const r = ev.priceMin != null ? { min: ev.priceMin, max: ev.priceMax ?? ev.priceMin } : parsePriceRange(false, ev.price)
  if (r.min == null) return { range: ev.price || 'Price not published', fees: null }
  const range = r.max != null && r.max !== r.min ? `${money(r.min)} – ${money(r.max)}` : money(r.min)
  const fees = ev.feesIncluded === true ? 'Includes booking fees' : 'Booking fees may apply at checkout'
  return { range, fees }
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
  if (ev.source === 'promoter' && ev.promoterVerified) { score += 5; reasons.push('Organiser is verified') }

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
