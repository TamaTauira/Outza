/**
 * Public listings hide a session that has already finished, a title that names
 * a different day, and a second copy of the same night at the same venue.
 * Nothing here deletes a row.
 */
import { normalizeTitle, normalizeVenue, similarity, SOURCES } from '@/lib/quality'
import { isPastEvent } from '@/lib/seo'

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
}
const MONTH_RE = Object.keys(MONTHS).join('|')

export type PublicSession = {
  title?: string | null
  venueName?: string | null
  city?: string | null
  date?: string | Date | null
  endDate?: string | Date | null
  time?: string | null
  endTime?: string | null
  endsAt?: string | Date | null
  ticketUrl?: string | null
  source?: string | null
  description?: string | null
}

export function sessionDateKey(value: string | Date | null | undefined): string {
  if (!value) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function pushDate(out: string[], day: string, monthName: string, year: string | undefined, yearHint: number) {
  const month = MONTHS[monthName]
  const d = Number(day)
  if (!month || d < 1 || d > 31) return
  out.push(`${year ? Number(year) : yearHint}-${pad(month)}-${pad(d)}`)
}

/** Calendar days named in a title. Halloween, with no other date, is 31 October. */
export function namedDatesInTitle(title: string, yearHint: number): string[] {
  const text = title.toLowerCase()
  const out: string[] = []
  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})\\b(?:\\s+(20\\d{2}))?`, 'g')
  const monthFirst = new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:\\s+(20\\d{2}))?`, 'g')
  for (const match of text.matchAll(dayFirst)) pushDate(out, match[1], match[2], match[3], yearHint)
  for (const match of text.matchAll(monthFirst)) pushDate(out, match[2], match[1], match[3], yearHint)
  if (!out.length && /\bhalloween\b/.test(text)) out.push(`${yearHint}-10-31`)
  return [...new Set(out)]
}

/** A title that names 7 November is not the listing for 21 November. No named day means it agrees. */
export function titleAgreesWithSession(title: string, dateKey: string): boolean {
  if (!dateKey) return true
  const named = namedDatesInTitle(title, Number(dateKey.slice(0, 4)))
  if (!named.length) return true
  if (named.includes(dateKey)) return true
  if (named.length === 1 && named[0].endsWith('-10-31')) {
    const md = dateKey.slice(5)
    if (md === '10-30' || md === '10-31' || md === '11-01') return true
  }
  return false
}

function minutes(value?: string | null): number | null {
  const match = value?.match(/^(\d{1,2}):(\d{2})/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

/** The finish instant is already in the past. Same rule as the event page and the home rails. */
export function occurrenceEnded(ev: PublicSession, now = new Date()): boolean {
  return isPastEvent(ev, now)
}

/** Hide from every public surface. Saved rows the visitor already chose are left to the date check. */
export function hiddenFromPublic(ev: PublicSession, now = new Date()): boolean {
  const key = sessionDateKey(ev.date)
  if (ev.title && key && !titleAgreesWithSession(ev.title, key)) return true
  return occurrenceEnded(ev, now)
}

function coreTitle(title: string): string {
  return normalizeTitle(title)
    .replace(/\bglass\s+house\b/g, 'glasshouse')
    .replace(/\b\d+(?:st|nd|rd|th)?\b/g, ' ')
    .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|halloween|home|main|entry|free|complimentary|feat|secret|guests)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Home The Venue and Home Main Venue are one room for a same-night copy. */
export function venuesAlike(a?: string | null, b?: string | null): boolean {
  const left = normalizeVenue(a ?? '')
  const right = normalizeVenue(b ?? '')
  if (!left || !right) return false
  if (left === right || similarity(left, right) >= 0.5) return true
  const home = (name: string) => name === 'home' || name === 'home main'
  return home(left) && home(right)
}

function sharesDistinctiveToken(a: string, b: string): boolean {
  const left = new Set(a.split(' ').filter((w) => w.length >= 8))
  for (const word of b.split(' ')) if (word.length >= 8 && left.has(word)) return true
  return false
}

/**
 * Same city, same night, start within 45 minutes, same venue alias, and a similar title.
 * Weekly copies on later dates stay separate.
 */
export function sameShowing(a: PublicSession, b: PublicSession): boolean {
  if (a.city && b.city && a.city !== b.city) return false
  const dayA = sessionDateKey(a.date)
  const dayB = sessionDateKey(b.date)
  if (!dayA || dayA !== dayB) return false
  const startA = minutes(a.time)
  const startB = minutes(b.time)
  if (startA != null && startB != null && Math.abs(startA - startB) > 45) return false
  if (!venuesAlike(a.venueName, b.venueName)) return false
  const coreA = coreTitle(a.title ?? '')
  const coreB = coreTitle(b.title ?? '')
  if (!coreA || !coreB) return false
  if (coreA === coreB || similarity(coreA, coreB) >= 0.6) return true
  if (coreA.includes(coreB) || coreB.includes(coreA)) return true
  return sharesDistinctiveToken(coreA, coreB)
}

/** Ticket link, then a title that names this session, then the more trusted source. */
export function listingScore(ev: PublicSession): number {
  const key = sessionDateKey(ev.date)
  const named = key && ev.title ? namedDatesInTitle(ev.title, Number(key.slice(0, 4))) : []
  const namesThisNight = named.length > 0 && named.includes(key)
  return (ev.ticketUrl ? 8 : 0) + (namesThisNight ? 4 : 0) + (SOURCES[ev.source ?? '']?.trust ?? 0) + ((ev.description ?? '').length > 80 ? 1 : 0)
}

/** Keep one row per real night. The higher score replaces an earlier copy in the same slot. */
export function collapseShowings<T extends PublicSession>(rows: T[]): T[] {
  const kept: T[] = []
  for (const row of rows) {
    const index = kept.findIndex((earlier) => sameShowing(earlier, row))
    if (index < 0) {
      kept.push(row)
      continue
    }
    if (listingScore(row) > listingScore(kept[index])) kept[index] = row
  }
  return kept
}
