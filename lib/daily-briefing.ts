/**
 * City-level written briefings. Every line comes from a stored listing.
 * The spoken script is the same for everyone in the city. A signed-in person's
 * saved preferences can reorder the on-screen list only.
 */
import { createHash } from 'node:crypto'
import { buildProfile, scoreEvent, type DigestEvent, type TasteSource } from '@/lib/newsletter/taste'
import { EDITION_LABEL, type Edition } from '@/lib/daily-editions'
import { eventPath, addDaysKey } from '@/lib/seo'
import { minutesOf } from '@/lib/listing-window'

export type { Edition } from '@/lib/daily-editions'
export { EDITIONS, EDITION_LABEL, isEdition } from '@/lib/daily-editions'

const FRESH_MS = 14 * 24 * 60 * 60 * 1000
const CAP = 6
const EXPLICIT = new Set(['interest', 'vibe', 'saved-like', 'saved', 'venue', 'free', 'budget', 'family', 'lgbtiq', 'together', 'itinerary'])
const EXPLICIT_WEIGHT: Record<string, number> = {
  saved: 5, together: 5, venue: 4, itinerary: 4, interest: 3, 'saved-like': 3, vibe: 2, lgbtiq: 2, family: 2, free: 1, budget: 1,
}
const PASSIVE_LINE = /peep|last time/i

export type BriefingCandidate = {
  id: string
  title: string
  description: string | null
  date: string
  endDate: string | null
  time: string | null
  endTime: string | null
  venueName: string
  suburb: string | null
  city: string
  category: string
  subTags?: string[]
  isFree: boolean
  isLGBTI?: boolean
  price: string | null
  priceMin?: number | null
  status: string
  duplicateOfId: string | null
  lastVerifiedAt: string | null
  updatedAt: string
  source: string
  imageUrl?: string | null
  ageRestriction?: string | null
  latitude?: number | null
  longitude?: number | null
  createdAt?: string
  heat?: number
}

export type BriefingItem = {
  id: string
  title: string
  when: string
  where: string
  line: string
  path: string
  note: string | null
}

export type BriefingTranscript = {
  edition: Edition
  city: string
  day: string
  intro: string
  items: BriefingItem[]
  outro: string
  empty: string | null
}

function dayKey(value: string): string {
  return value.slice(0, 10)
}

function dateLabel(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  })
}

export function briefingFresh(event: BriefingCandidate, now: number): boolean {
  if (event.duplicateOfId) return false
  if (event.status !== 'SCHEDULED' && event.status !== 'RESCHEDULED') return false
  if (!event.title.trim() || !event.venueName.trim() || !event.city.trim()) return false
  const seen = Date.parse(event.lastVerifiedAt || event.updatedAt)
  return Number.isFinite(seen) && now - seen <= FRESH_MS
}

function ended(event: BriefingCandidate, day: string, nowMinutes: number): boolean {
  const end = dayKey(event.endDate || event.date)
  if (end < day) return true
  if (end > day) return false
  const finish = minutesOf(event.endTime)
  if (finish == null) return false
  return nowMinutes >= finish
}

function weekendDays(day: string): string[] {
  const date = new Date(`${day}T00:00:00.000Z`)
  const dow = date.getUTCDay()
  if (dow === 6) return [day, addDaysKey(day, 1)]
  if (dow === 0) return [day]
  const sat = addDaysKey(day, 6 - dow)
  return [sat, addDaysKey(sat, 1)]
}

function inEdition(event: BriefingCandidate, edition: Edition, day: string): boolean {
  const start = dayKey(event.date)
  const end = dayKey(event.endDate || event.date)
  if (edition === 'weekend') return weekendDays(day).some((key) => key >= start && key <= end)
  if (end < day || start > day) return false
  if (edition === 'today') return true
  const startMin = minutesOf(event.time)
  if (startMin == null) return false
  return startMin >= 17 * 60
}

function listingLine(event: BriefingCandidate): string {
  const bits = [`Listed as ${event.category}.`]
  if (event.isFree) bits.push('The listing says it is free.')
  else if (event.price?.trim()) bits.push(`Listed price: ${event.price.trim()}.`)
  else bits.push('No price is listed.')
  const quote = event.description?.replace(/\s+/g, ' ').trim()
  if (quote) bits.push(`The listing says: “${quote.slice(0, 120)}${quote.length > 120 ? '…' : ''}”`)
  return bits.join(' ')
}

function whenLabel(event: BriefingCandidate): string {
  const day = dateLabel(dayKey(event.date))
  return event.time ? `${day}, ${event.time}` : day
}

function toItem(event: BriefingCandidate, note: string | null): BriefingItem {
  const where = [event.venueName, event.suburb && event.suburb !== event.city ? event.suburb : null].filter(Boolean).join(', ')
  return {
    id: event.id,
    title: event.title.trim(),
    when: whenLabel(event),
    where,
    line: listingLine(event),
    path: eventPath(event),
    note,
  }
}

function byHeatThenTime(a: BriefingCandidate, b: BriefingCandidate): number {
  return (b.heat ?? 0) - (a.heat ?? 0)
    || dayKey(a.date).localeCompare(dayKey(b.date))
    || (minutesOf(a.time) ?? 24 * 60) - (minutesOf(b.time) ?? 24 * 60)
    || a.id.localeCompare(b.id)
}

export function selectEdition(events: BriefingCandidate[], edition: Edition, day: string, nowMinutes: number, now = Date.now()): BriefingCandidate[] {
  return events
    .filter((event) => briefingFresh(event, now) && !ended(event, day, nowMinutes) && inEdition(event, edition, day))
    .sort(byHeatThenTime)
    .slice(0, CAP)
}

export function buildTranscript(events: BriefingCandidate[], edition: Edition, city: string, day: string, nowMinutes: number, now = Date.now()): BriefingTranscript {
  const picked = selectEdition(events, edition, day, nowMinutes, now)
  const label = EDITION_LABEL[edition].toLowerCase()
  const intro = `Here is ${label} for ${city} on ${dateLabel(day)}. Times are ${city} time. This is a summary of listings on VibePeep, not a review, and it only includes events checked in the last 14 days.`
  return {
    edition,
    city,
    day,
    intro,
    items: picked.map((event) => toItem(event, null)),
    outro: 'Details can change. Open the event page and confirm with the organiser before you go.',
    empty: picked.length ? null : `Nothing listed for this edition in ${city} was checked in the last 14 days.`,
  }
}

export function spokenScript(transcript: BriefingTranscript): string {
  if (!transcript.items.length) return `${transcript.intro}\n${transcript.empty}`
  const lines = [transcript.intro]
  for (const item of transcript.items) lines.push(`${item.title}. ${item.when}. ${item.where}. ${item.line}`)
  lines.push(transcript.outro)
  return lines.join('\n')
}

export function briefingHash(transcript: BriefingTranscript): string {
  const body = transcript.items.map((item) => [item.id, item.title, item.when, item.where, item.line].join('|')).join('\n')
  return createHash('sha256').update(`${transcript.edition}\n${transcript.day}\n${body}`).digest('hex').slice(0, 20)
}

function asDigest(event: BriefingCandidate): DigestEvent {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    date: new Date(event.date),
    endDate: event.endDate ? new Date(event.endDate) : null,
    time: event.time,
    venueName: event.venueName,
    suburb: event.suburb,
    city: event.city,
    category: event.category,
    subTags: event.subTags ?? [],
    isFree: event.isFree,
    isLGBTI: !!event.isLGBTI,
    priceMin: event.priceMin ?? null,
    imageUrl: event.imageUrl ?? null,
    hasImage: !!event.imageUrl,
    ageRestriction: event.ageRestriction ?? null,
    latitude: event.latitude ?? null,
    longitude: event.longitude ?? null,
    status: event.status,
    duplicateOfId: event.duplicateOfId,
    source: event.source,
    lastVerifiedAt: event.lastVerifiedAt ? new Date(event.lastVerifiedAt) : null,
    updatedAt: new Date(event.updatedAt),
    popularity: event.heat ?? 0,
    createdAt: new Date(event.createdAt || event.updatedAt),
  }
}

/** Reorders the on-screen list using the existing taste profile. The spoken script is unchanged. */
export function personaliseItems(items: BriefingItem[], events: BriefingCandidate[], source: TasteSource | null): { items: BriefingItem[]; personalised: boolean } {
  if (!source || !items.length) return { items, personalised: false }
  const profile = buildProfile(source)
  const byId = new Map(events.map((event) => [event.id, event]))
  const ranked = items.map((item, index) => {
    const event = byId.get(item.id)
    if (!event) return { item, score: 0, index }
    const scored = scoreEvent(asDigest(event), profile)
    const codes = scored.why.filter((code) => EXPLICIT.has(code))
    const score = codes.reduce((sum, code) => sum + (EXPLICIT_WEIGHT[code] ?? 1), 0)
    let note: string | null = null
    if (score > 0 && scored.whyLine && !PASSIVE_LINE.test(scored.whyLine)) note = scored.whyLine
    else if (codes.includes('saved')) note = 'On your watchlist'
    else if (codes.includes('venue')) note = `Because you follow ${event.venueName}`
    else if (codes.includes('interest')) note = `Because you follow ${event.category}`
    else if (codes.includes('saved-like')) note = `Like other ${event.category} events you saved`
    else if (codes.includes('vibe')) note = 'Lines up with a vibe you saved'
    else if (codes.includes('free')) note = 'Free, matching the spend you set'
    else if (codes.includes('lgbtiq')) note = 'Because you follow the LGBTIQ+ scene'
    else if (codes.includes('family')) note = 'Fits the crew you saved'
    else if (codes.includes('budget')) note = 'Inside the spend you set'
    return { item: { ...item, note }, score: note ? score : 0, index }
  })
  const personalised = ranked.some((row) => row.score > 0)
  if (!personalised) return { items, personalised: false }
  ranked.sort((a, b) => b.score - a.score || a.index - b.index)
  return { items: ranked.map((row) => row.item), personalised: true }
}
