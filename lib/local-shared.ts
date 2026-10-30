/** Client-safe constants and recurrence maths for VibePeep Local. */

export const LOCAL_CATEGORIES = [
  { key: 'GARAGE', label: 'Garage & moving sales', short: 'Garage sale', blurb: 'Household goods, furniture, clothing and collectibles from local sellers.' },
  { key: 'WAREHOUSE', label: 'Warehouse & clearance sales', short: 'Clearance', blurb: 'Temporary sales from fashion labels, retailers and wholesalers.' },
  { key: 'MARKET', label: 'Markets & pop-up shops', short: 'Market / pop-up', blurb: 'Vintage and makers’ markets, food stalls, seasonal markets and independent pop-ups.' },
  { key: 'COMMUNITY', label: 'Community events & activities', short: 'Community event', blurb: 'Fundraisers, exhibitions, festivals, neighbourhood celebrations, trivia, fitness and hobby meetups.' },
] as const
export type LocalCategory = (typeof LOCAL_CATEGORIES)[number]['key']
/** Only garage/moving and warehouse/clearance listings are sales; markets and community listings are events. */
export const isSaleCategory = (k?: string | null) => k === 'GARAGE' || k === 'WAREHOUSE'
/** Same title + suburb + city = the same listing for display (catches repeat imports of one event). */
export const localDupKey = (l: { title: string; suburb: string; city: string }) =>
  `${l.city}|${l.suburb}|${l.title}`.toLowerCase().normalize('NFKD').replace(/[^a-z0-9|]+/g, '')
export const localCategoryLabel = (k: string) => LOCAL_CATEGORIES.find((c) => c.key === k)?.label ?? k
export const localCategoryShort = (k: string) => LOCAL_CATEGORIES.find((c) => c.key === k)?.short ?? k

export const RECURRENCES = [
  { key: 'NONE', label: 'Just once' },
  { key: 'WEEKLY', label: 'Every week' },
  { key: 'FORTNIGHTLY', label: 'Every fortnight' },
  { key: 'MONTHLY_NTH', label: 'Monthly (same weekday, e.g. first Sunday)' },
] as const
export type Recurrence = (typeof RECURRENCES)[number]['key']

/** Recurring listings run at most this long before the organiser renews them. */
export const MAX_RECUR_DAYS = 182
/** One-off sales can span at most this many days (e.g. a warehouse clearance). */
export const MAX_SPAN_DAYS = 14
/** Listings can be submitted at most this far ahead. */
export const MAX_AHEAD_DAYS = 365

export const LOCAL_FLAG_LABEL: Record<string, string> = {
  ADDRESS_UNVERIFIED: 'Address could not be matched',
  OUTSIDE_CITY: 'Address looks outside the chosen city',
  POSSIBLE_DUPLICATE: 'Possible duplicate',
  SPAM_SIGNALS: 'Spam signals',
  MODERATION: 'Content needs a look',
  ANONYMOUS: 'Submitted without an account',
  REPORTED: 'Reported by visitors',
  IMPORTED: 'Imported from a public event listing',
}

export interface LocalSource { name: string; bestFor: string; status: string; url?: string }
/** Where VibePeep Local listings come from and what each source's status is. */
export const LOCAL_SOURCES: LocalSource[] = [
  { name: 'Organiser & community submissions', bestFor: 'Garage sales, pop-ups, community activities', status: 'Live — submitted directly by organisers', url: '/local?tab=submit' },
  { name: 'Public event listings already on VibePeep (official market sites, City of Sydney What’s On, Eventbrite, Humanitix, Moshtix, Oztix)', bestFor: 'Markets, swaps, sample sales, community events', status: 'Live — facts only (date, time, place, price), no images, always linked to the original listing' },
  { name: 'Other local council event calendars', bestFor: 'Free and community events', status: 'Added council by council where a public data feed exists; councils can also submit their events', url: '/local?tab=submit' },
  { name: 'Meetup', bestFor: 'Social groups, networking and activities', status: 'Needs an approved Meetup API connection — not imported yet; group organisers can submit public events', url: '/local?tab=submit' },
  { name: 'Garage Sale Trail', bestFor: 'Garage sales, pop-ups, community shopping events', status: 'Partnership or licensed feed — not imported; hosts can submit their own sale', url: 'https://www.garagesaletrail.com.au/' },
  { name: 'Garage Sale Finder', bestFor: 'Individual garage and moving sales', status: 'Permission or partnership needed — not imported', },
  { name: 'Local market operators & official organiser websites', bestFor: 'Regular markets', status: 'Listed when the operator submits, linking to their official site' },
  { name: 'Business-submitted feeds', bestFor: 'Warehouse and clearance sales', status: 'By arrangement with the business' },
  { name: 'Facebook Events & Marketplace', bestFor: 'Pop-ups, community activities, sales', status: 'Not scraped — organisers can submit their own public event', url: '/local?tab=submit' },
]

// ---------- date helpers (pure YYYY-MM-DD strings, no timezone drift) ----------
const toUTC = (d: string) => new Date(`${d}T00:00:00Z`)
const fromUTC = (t: Date) => t.toISOString().slice(0, 10)
export const addDaysStr = (d: string, n: number) => { const t = toUTC(d); t.setUTCDate(t.getUTCDate() + n); return fromUTC(t) }
export const diffDays = (a: string, b: string) => Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86400000)
export const todayIn = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export const isDateStr = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toUTC(s).getTime())
export const isTimeStr = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)

const ORD = ['first', 'second', 'third', 'fourth', 'last']
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function nthOf(d: string) {
  const t = toUTC(d)
  const n = Math.floor((t.getUTCDate() - 1) / 7) // 0..4
  return { dow: t.getUTCDay(), n: Math.min(n, 4) }
}
function nthWeekday(year: number, month: number, dow: number, n: number): string {
  if (n >= 4) { // last
    const last = new Date(Date.UTC(year, month + 1, 0))
    last.setUTCDate(last.getUTCDate() - ((last.getUTCDay() - dow + 7) % 7))
    return fromUTC(last)
  }
  const first = new Date(Date.UTC(year, month, 1))
  first.setUTCDate(1 + ((dow - first.getUTCDay() + 7) % 7) + n * 7)
  return fromUTC(first)
}

export interface RecurringShape { startDate: string; endDate?: string | null; recurrence: string; recurUntil?: string | null; category?: string | null }

/** Last date the listing is on (used for expiry). */
export function lastDate(l: RecurringShape): string {
  if (l.recurrence === 'NONE') return l.endDate && l.endDate > l.startDate ? l.endDate : l.startDate
  const cap = addDaysStr(l.startDate, MAX_RECUR_DAYS)
  const until = l.recurUntil && l.recurUntil < cap ? l.recurUntil : cap
  const all = occurrences(l, l.startDate, until)
  return all[all.length - 1] ?? l.startDate
}

/** Every date (YYYY-MM-DD) the listing runs on, within [from, to] inclusive. */
export function occurrences(l: RecurringShape, from: string, to: string): string[] {
  const out: string[] = []
  if (l.recurrence === 'NONE') {
    const end = l.endDate && l.endDate > l.startDate ? l.endDate : l.startDate
    for (let d = l.startDate; d <= end && out.length < 31; d = addDaysStr(d, 1)) if (d >= from && d <= to) out.push(d)
    return out
  }
  const cap = addDaysStr(l.startDate, MAX_RECUR_DAYS)
  const until = [to, cap, l.recurUntil || cap].sort()[0]
  if (l.recurrence === 'WEEKLY' || l.recurrence === 'FORTNIGHTLY') {
    const step = l.recurrence === 'WEEKLY' ? 7 : 14
    for (let d = l.startDate; d <= until; d = addDaysStr(d, step)) if (d >= from) out.push(d)
    return out
  }
  if (l.recurrence === 'MONTHLY_NTH') {
    const { dow, n } = nthOf(l.startDate)
    const s = toUTC(l.startDate)
    for (let i = 0; i < 8; i++) {
      const d = nthWeekday(s.getUTCFullYear(), s.getUTCMonth() + i, dow, n)
      if (d > until) break
      if (d >= from && d >= l.startDate) out.push(d)
    }
  }
  return out
}

export function recurrenceLabel(l: RecurringShape): string {
  const dow = DOW[toUTC(l.startDate).getUTCDay()]
  if (l.recurrence === 'WEEKLY') return `Every ${dow}`
  if (l.recurrence === 'FORTNIGHTLY') return `Every second ${dow}`
  if (l.recurrence === 'MONTHLY_NTH') return `${ORD[nthOf(l.startDate).n][0].toUpperCase()}${ORD[nthOf(l.startDate).n].slice(1)} ${dow} of the month`
  if (l.endDate && l.endDate > l.startDate) return `${diffDays(l.startDate, l.endDate) + 1}-day ${isSaleCategory(l.category) ? 'sale' : 'event'}`
  return 'One-off'
}

export const fmtTime = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`
}
/** Canonical detail URL for a Local listing: /local/<slug>-<id> (ids never contain hyphens). */
export const localPath = (l: { id: string; title?: string | null }, date?: string | null) => {
  const slug = (l.title ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '')
  return `/local/${slug ? `${slug}-` : ''}${l.id}${date ? `?date=${date}` : ''}`
}

export interface LocalOccurrence { id: string; title: string; category: string; description?: string | null; address: string; suburb: string; city: string; startTime: string; endTime: string; priceNote: string | null; date: string; schedule: string }

/**
 * Shapes one dated occurrence as a board row / saved favourite. Id is per date so each date can be saved or planned separately.
 * Description is optional: a stale tab can receive a feed item that no longer includes it, and that must degrade instead of throwing.
 */
export function localToBoard(o: LocalOccurrence) {
  return {
    id: `local-${o.id}-${o.date}`, title: o.title, description: (o.description ?? '').slice(0, 400), date: o.date, endDate: null, time: o.startTime, endTime: o.endTime,
    venueName: o.address, suburb: o.suburb, category: localCategoryShort(o.category), subTags: [o.schedule], isLGBTI: false,
    isFree: !!o.priceNote && /^free\b/i.test(o.priceNote.trim()), price: o.priceNote ?? 'See listing', ticketUrl: null, city: o.city, href: localPath(o, o.date),
  }
}

export const fmtDay = (d: string) => toUTC(d).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
