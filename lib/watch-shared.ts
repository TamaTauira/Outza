import { cityDef, tidyVenueName } from '@/lib/cities'
import { EMAIL_C, EMAIL_FONT, emailButton, emailDocument, emailEscape, emailTick } from '@/lib/email-brand'
import { categoryColor, categoryInk } from '@/lib/categories'
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
const T = 'role="presentation" cellpadding="0" cellspacing="0" border="0"'

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

const DISCLAIMER = 'Times and prices can change. Confirm with the organiser before you go. VibePeep does not sell tickets and does not show live availability.'

function artCell(row: MailEvent): string {
  if (row.image && /^https:\/\//i.test(row.image)) {
    const alt = emailEscape(`${row.title} at ${row.venue}`)
    const src = emailEscape(row.image)
    return `<img class="thumbimg" src="${src}" alt="${alt}" width="112" height="112" style="display:block;width:112px;height:112px;object-fit:cover;border:0;outline:none;text-decoration:none;border-radius:12px;-ms-interpolation-mode:bicubic;"/>`
  }
  const bg = categoryColor(row.category || 'Event')
  const fg = categoryInk(bg)
  const label = emailEscape((row.category || 'Event').trim() || 'Event')
  return `<table ${T} class="thumbBox" width="112" height="112" bgcolor="${bg}" style="width:112px;height:112px;background:${bg};border-radius:12px;"><tr><td align="center" valign="middle" width="112" height="112" bgcolor="${bg}" style="width:112px;height:112px;background:${bg};border-radius:12px;font-family:${EMAIL_FONT};font-size:11px;line-height:1.3;font-weight:800;letter-spacing:0.6px;color:${fg};text-transform:uppercase;padding:8px;">${label}</td></tr></table>`
}

function priceChip(row: MailEvent): string {
  if (!row.price || !row.priceKind) return ''
  const free = row.priceKind === 'free'
  const bg = free ? EMAIL_C.freeBg : EMAIL_C.priceBg
  const fg = free ? EMAIL_C.freeInk : EMAIL_C.deep
  const cls = free ? 'chipFree' : 'chipPaid'
  return `<table ${T} style="margin-top:8px;"><tr><td class="${cls}" bgcolor="${bg}" style="background:${bg};border-radius:999px;padding:3px 10px;"><span style="font-family:${EMAIL_FONT};font-size:12px;line-height:16px;font-weight:700;color:${fg};">${emailEscape(row.price)}</span></td></tr></table>`
}

function eventCard(row: MailEvent): string {
  const tick = row.claimed ? `&nbsp;${emailTick(row.claimed)}` : ''
  return `<tr><td class="px" style="padding:0 24px 12px;">
<table ${T} width="100%" class="card stack" bgcolor="${EMAIL_C.card}" style="width:100%;background:${EMAIL_C.card};border:1px solid ${EMAIL_C.line};border-radius:16px;"><tr>
<td class="thumb" width="112" valign="top" style="width:112px;padding:12px 0 12px 12px;">${artCell(row)}</td>
<td valign="top" style="padding:14px 16px 16px 14px;">
<a href="${emailEscape(row.href)}" class="tx" style="font-family:${EMAIL_FONT};font-size:18px;line-height:1.3;font-weight:800;color:${EMAIL_C.ink};text-decoration:none;">${emailEscape(row.title)}</a>
<div class="mu" style="font-family:${EMAIL_FONT};font-size:14px;line-height:1.45;color:${EMAIL_C.muted};padding-top:6px;">${emailEscape(row.when)}</div>
<div class="mu" style="font-family:${EMAIL_FONT};font-size:14px;line-height:1.45;color:${EMAIL_C.muted};padding-top:2px;">${emailEscape(row.venue)}${tick}</div>
${priceChip(row)}
<div style="padding-top:12px;">${emailButton(row.href, 'View event')}</div>
</td></tr></table></td></tr>`
}

function sectionRows(heading: string, rows: MailEvent[]): string {
  if (!rows.length) return ''
  const head = `<tr><td class="px" style="padding:22px 24px 10px;"><div class="tx" style="font-family:${EMAIL_FONT};font-size:20px;line-height:1.25;font-weight:800;color:${EMAIL_C.ink};">${emailEscape(heading)}</div></td></tr>`
  return head + rows.map(eventCard).join('')
}

/** Builds the watchlist email. Returns null when there is nothing upcoming to send. */
export function composeWatchEmail(input: {
  saved: MailEvent[]
  matches: MailEvent[]
  reminders?: boolean
  manageHref?: string
  unsubscribeHref?: string
  homeHref?: string
}): { subject: string; html: string; text: string } | null {
  if (!input.saved.length && !input.matches.length) return null
  const subject = input.reminders ? 'A saved VibePeep event is coming up' : 'Your VibePeep watchlist'
  const home = input.homeHref ?? CANONICAL_SITE_URL
  const manage = input.manageHref ?? `${home}/account`
  const unsubscribe = input.unsubscribeHref ?? manage
  const savedHeading = input.reminders ? 'Coming up from your keepers' : 'Saved and still ahead'
  const matchHeading = 'New listings that match what you follow'
  const text: string[] = [subject, '']
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
  text.push(DISCLAIMER)
  text.push(`Manage preferences: ${manage}`)
  text.push(`Unsubscribe: ${unsubscribe}`)
  text.push(`VibePeep: ${home}`)
  const rows = [sectionRows(savedHeading, input.saved), sectionRows(matchHeading, input.matches)].join('')
  const html = emailDocument({
    title: subject,
    preheader: input.reminders ? 'A saved event is coming up.' : 'Saved events still ahead, and new listings in the cities you follow.',
    rows,
    manageHref: manage,
    unsubscribeHref: unsubscribe,
    homeHref: home,
    disclaimer: DISCLAIMER,
    reason: 'You asked for these notes. Turn them off any time from My VibePeep.',
  })
  return { subject, html, text: text.join('\n') }
}
