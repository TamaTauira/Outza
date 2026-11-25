import { cityDef, tidyVenueName } from '@/lib/cities'
import { EMAIL_ADDRESS, EMAIL_DISCLAIMER, emailBodyCell, emailDocument, emailEventCard, emailPlainFooter, emailSectionHeading, emailTick } from '@/lib/email-brand'
import { dateKeyOf, formatBoardRange, minutesNow, minutesOf, resolveSchedule, scheduleFinished } from '@/lib/listing-window'
import { formatPrice } from '@/lib/price'
import { CLAIMED_TICK_COPY } from '@/lib/ownership'
import { cityToday } from '@/lib/seo'
import { CANONICAL_SITE_URL } from '@/lib/site-url'
import { hhmm, zonedWallTime } from '@/lib/zoned-time'

export const MAIL_INTERVAL_MS: Record<string, number> = {
  daily: 22 * 3600e3,
  weekly: 6.5 * 86400e3,
  monthly: 29 * 86400e3,
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CLOSED = new Set(['CANCELLED', 'POSTPONED'])

export function mailDue(last: Date | null | undefined, frequency: string | null | undefined, now = Date.now()): boolean {
  if (!last) return true
  const interval = MAIL_INTERVAL_MS[(frequency ?? 'weekly').toLowerCase()] ?? MAIL_INTERVAL_MS.weekly
  return now - last.getTime() >= interval
}

/**
 * True when a saved event should get one reminder email.
 * Timed events: start is 2–36 hours away.
 * Untimed events: local noon on the event date is 2–30 hours away, so the note lands the day before or that morning.
 */
export function inReminderWindow(dateKey: string, time: string | null | undefined, city: string | null | undefined, now = new Date()): boolean {
  const tz = cityDef(city).tz
  const clock = hhmm(time)
  const start = zonedWallTime(dateKey, clock ?? '12:00', tz)
  const hours = (start.getTime() - now.getTime()) / 3600000
  if (clock) return hours >= 2 && hours <= 36
  return hours >= 2 && hours <= 30
}

export type MailEvent = {
  id: string
  title: string
  when: string
  venue: string
  href: string
  image?: string | null
  price?: string | null
  priceKind?: 'free' | 'paid' | null
  category?: string | null
  claimed?: keyof typeof CLAIMED_TICK_COPY | null
}

export type WatchRow = {
  id: string
  title: string
  date: Date | string
  endDate?: Date | string | null
  time?: string | null
  endTime?: string | null
  venueName: string
  venueAddress?: string | null
  suburb?: string | null
  city: string
  category?: string | null
  seriesKey?: string | null
  status?: string | null
  duplicateOfId?: string | null
  isFree?: boolean
  price?: string | null
  priceMin?: number | null
  priceMax?: number | null
  allDay?: boolean | null
}

export type FollowTarget = {
  cities: string[]
  interests: string[]
  venues: { venueName: string; city: string | null }[]
}

const norm = (value: string | null | undefined) => (value ?? '').trim().toLowerCase()

/** Cities the person actually follows. Home city is the fallback when they have not picked any. */
export function followedCities(preferred: string[] | null | undefined, home?: string | null): string[] {
  const picked = (preferred ?? []).map((city) => city.trim()).filter(Boolean)
  const wanted = picked.length ? picked : home?.trim() ? [home.trim()] : []
  const names = wanted.map((city) => {
    const known = cityDef(city).name
    return known && norm(known) === norm(city) ? known : city
  })
  return [...new Set(names)]
}

/** The listing has not finished in its own city. A start date of yesterday is not enough to keep it. */
export function stillAhead(ev: WatchRow, now = new Date()): boolean {
  if (ev.duplicateOfId) return false
  if (ev.status && CLOSED.has(ev.status)) return false
  const startKey = dateKeyOf(ev.date)
  if (!startKey) return false
  const today = cityToday(cityDef(ev.city), now)
  const sched = resolveSchedule(ev, startKey)
  const endKey = sched.endKey || dateKeyOf(ev.endDate) || startKey
  if (endKey < today) return false
  if (startKey > today) return true
  const nowMin = minutesNow(ev.city, now)
  if (endKey > today) return true
  if (startKey < today) {
    if (sched.end == null) return true
    const finish = ((sched.end % 1440) + 1440) % 1440
    return nowMin < finish
  }
  return !scheduleFinished(sched, nowMin)
}

/** Stored series id, otherwise the same title, venue and city. */
export function seriesIdentity(ev: Pick<WatchRow, 'seriesKey' | 'title' | 'venueName' | 'city'>): string {
  const series = ev.seriesKey?.trim()
  if (series) return `series:${series.toLowerCase()}`
  return `listing:${norm(ev.title)}|${norm(ev.venueName)}|${norm(ev.city)}`
}

export function matchesFollow(ev: WatchRow, follow: FollowTarget): boolean {
  const cities = follow.cities.map(norm)
  if (!cities.length || !cities.includes(norm(ev.city))) return false
  const interests = follow.interests.map(norm).filter(Boolean)
  const categoryHit = interests.includes(norm(ev.category))
  const venueHit = follow.venues.some((venue) => norm(venue.venueName) === norm(ev.venueName) && (!venue.city || norm(venue.city) === norm(ev.city)))
  if (!interests.length && !follow.venues.length) return false
  return categoryHit || venueHit
}

function bySoonest(a: WatchRow, b: WatchRow): number {
  const ad = dateKeyOf(a.date)
  const bd = dateKeyOf(b.date)
  if (ad !== bd) return ad < bd ? -1 : 1
  return (minutesOf(a.time) ?? 24 * 60) - (minutesOf(b.time) ?? 24 * 60) || a.id.localeCompare(b.id)
}

/**
 * Upcoming rows only, soonest first, one row per series.
 * Matches must sit in a followed city and match an interest or a followed venue.
 * A series already represented by an earlier row is not listed again.
 */
export function prepareWatchLists<T extends WatchRow>(input: {
  saved: T[]
  matches: T[]
  cities: string[]
  interests: string[]
  venues: { venueName: string; city: string | null }[]
  now?: Date
}): { saved: T[]; matches: T[] } {
  const now = input.now ?? new Date()
  const follow = { cities: input.cities, interests: input.interests, venues: input.venues }
  const saved = input.saved.filter((ev) => stillAhead(ev, now))
  const savedIds = new Set(saved.map((ev) => ev.id))
  const matches = input.matches.filter((ev) => !savedIds.has(ev.id) && stillAhead(ev, now) && matchesFollow(ev, follow))
  const tagged = [
    ...saved.map((ev) => ({ ev, kind: 'saved' as const })),
    ...matches.map((ev) => ({ ev, kind: 'match' as const })),
  ].sort((a, b) => bySoonest(a.ev, b.ev))
  const seen = new Set<string>()
  const outSaved: T[] = []
  const outMatches: T[] = []
  for (const row of tagged) {
    const key = seriesIdentity(row.ev)
    if (seen.has(key)) continue
    seen.add(key)
    if (row.kind === 'saved') outSaved.push(row.ev)
    else outMatches.push(row.ev)
  }
  return { saved: outSaved, matches: outMatches }
}

/** Same clock the board uses, in front of a short date. Example: Sat 7 Nov · 12:00 pm. */
export function emailWhen(ev: WatchRow): string {
  const key = dateKeyOf(ev.date)
  if (!key) return ''
  const d = new Date(`${key}T00:00:00Z`)
  const day = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
  const range = formatBoardRange(ev)
  if (!range.hm || range.hm === '--:--') return day
  return `${day} · ${range.label}`
}

export function emailPlace(ev: Pick<WatchRow, 'venueName' | 'venueAddress' | 'suburb' | 'city'>): string {
  const venue = tidyVenueName(ev.venueName, ev.venueAddress, ev.city)
  const suburb = ev.suburb && !venue.toLowerCase().includes(ev.suburb.toLowerCase()) ? ev.suburb.trim() : ''
  return [venue, suburb, ev.city].filter(Boolean).join(', ')
}

export function emailPrice(ev: Pick<WatchRow, 'isFree' | 'price' | 'priceMin' | 'priceMax'>): { text: string; kind: 'free' | 'paid' } | null {
  const priced = formatPrice(!!ev.isFree, ev.price ?? null, ev.priceMin, ev.priceMax)
  if (priced.kind === 'unknown') return null
  const text = priced.prefix ? `${priced.prefix} ${priced.value}` : priced.value
  return { text, kind: priced.kind }
}

function eventCard(row: MailEvent): string {
  return emailEventCard({
    href: row.href,
    title: row.title,
    when: row.when,
    place: row.venue,
    price: row.price ?? undefined,
    priceKind: row.priceKind,
    image: row.image ?? undefined,
    category: row.category ?? undefined,
    tickHtml: row.claimed ? emailTick(row.claimed) : '',
    cta: 'View event',
  })
}

function sectionRows(heading: string, rows: MailEvent[]): string {
  if (!rows.length) return ''
  return emailSectionHeading(heading) + rows.map(eventCard).join('')
}

/** Builds the watchlist email. Returns null when there is nothing upcoming to send. */
export function composeWatchEmail(input: {
  saved: MailEvent[]
  matches: MailEvent[]
  reminders?: boolean
  manageHref?: string
  unsubscribeHref?: string
  homeHref?: string
  /** City and date line under the banner, when the send knows them. */
  meta?: string
}): { subject: string; html: string; text: string } | null {
  if (!input.saved.length && !input.matches.length) return null
  const subject = input.reminders ? 'A keeper is coming up' : 'Your keepers are calling'
  const home = input.homeHref ?? CANONICAL_SITE_URL
  const manage = input.manageHref ?? `${home}/account`
  const unsubscribe = input.unsubscribeHref ?? manage
  const savedHeading = input.reminders ? 'Coming up on your list' : 'Don’t forget these'
  const matchHeading = 'New listings for your vibe'
  const opener = input.reminders
    ? 'One you saved is close. The time and the place are below.'
    : 'Here’s what you saved, plus new listings that match your vibe.'
  const text: string[] = [opener, '']
  const push = (heading: string, rows: MailEvent[]) => {
    if (!rows.length) return
    text.push(heading)
    for (const row of rows) {
      const price = row.price ? ` — ${row.price}` : ''
      const claim = row.claimed ? ` (${CLAIMED_TICK_COPY[row.claimed].label})` : ''
      text.push(`- ${row.title}`)
      text.push(`  ${row.when}`)
      text.push(`  ${row.venue}${claim}${price}`)
      text.push(`  ${row.href}`)
    }
    text.push('')
  }
  push(savedHeading, input.saved)
  push(matchHeading, input.matches)
  text.push(EMAIL_DISCLAIMER)
  text.push(`Manage preferences: ${manage}`)
  text.push(`Unsubscribe: ${unsubscribe}`)
  text.push(`VibePeep: ${home}`)
  text.push(EMAIL_ADDRESS)
  text.push(emailPlainFooter(home))
  const rows = [
    emailBodyCell(`<p class="tx" style="margin:0;font-size:16px;line-height:1.5;">${opener}</p>`),
    sectionRows(savedHeading, input.saved),
    sectionRows(matchHeading, input.matches),
  ].join('')
  const html = emailDocument({
    title: subject,
    preheader: input.reminders ? 'A saved event is close. The time and place are inside.' : 'Saved events, plus new listings in the cities you follow.',
    rows,
    meta: input.meta,
    manageHref: manage,
    unsubscribeHref: unsubscribe,
    homeHref: home,
    disclaimer: EMAIL_DISCLAIMER,
    reason: 'You asked for these notes. Turn them off any time from your account.',
    banner: input.reminders ? 'reminder' : 'matches',
  })
  return { subject, html, text: text.join('\n') }
}
