/**
 * Community hub rules. Client-safe: no database, no email, no secrets.
 * Ingested events leave communityKey null and are not affected by these rules.
 */
import { CITIES, type CityDef } from '@/lib/cities'
import { occurrences, isDateStr, isTimeStr, addDaysStr, diffDays, todayIn } from '@/lib/local-shared'
import { INDEX_FRESH_DAYS, assessIndexability } from '@/lib/indexability'
import { whenRange } from '@/lib/local-seo'
import { addDaysKey, citySlug, cityToday, eventPath, isTonightSlot, slugify, WHEN_KEYS, type WhenKey } from '@/lib/seo'

export const COMMUNITY_SECTIONS = [
  { key: 'garage-sales', label: 'Garage sales', short: 'Garage sale', blurb: 'Driveway treasures, moving sales and the good kind of clutter.', boardCategory: 'Community', subTags: [] as string[] },
  { key: 'school-fundraisers', label: 'School fundraisers', short: 'School fundraiser', blurb: 'Fetes, sausage sizzles and trivia nights. Suburb only, and no photos of children.', boardCategory: 'Community', subTags: ['Fundraiser'] },
  { key: 'farmers-markets', label: 'Farmers markets', short: 'Farmers market', blurb: 'Produce, flowers, coffee and the Saturday that is worth setting an alarm for.', boardCategory: 'Food & Drink', subTags: ['Market'] },
  { key: 'neighbourhood-popups', label: 'Neighbourhood pop-ups', short: 'Pop-up', blurb: 'Here this weekend, gone next week. Stalls, shops and one-off hangs.', boardCategory: 'Community', subTags: [] as string[] },
  { key: 'community-sport', label: 'Community sport', short: 'Community sport', blurb: 'Park footy, social comps and the local side’s home game.', boardCategory: 'Sports', subTags: [] as string[] },
  { key: 'charity-events', label: 'Charity events', short: 'Charity event', blurb: 'Fundraisers and community drives with a cause on the poster.', boardCategory: 'Community', subTags: ['Fundraiser'] },
  { key: 'dog-friendly', label: 'Dog-friendly meetups', short: 'Dog-friendly', blurb: 'Walks, pup picnics and parks that welcome the goodest plus-one.', boardCategory: 'Community', subTags: [] as string[] },
  { key: 'local-art', label: 'Local art', short: 'Local art', blurb: 'Studio trails, community galleries and the show in a converted shed.', boardCategory: 'Arts & Culture', subTags: ['Exhibition'] },
] as const

export type CommunityKey = (typeof COMMUNITY_SECTIONS)[number]['key']

export const COMMUNITY_RECURRENCE = [
  { key: 'NONE', label: 'Just once' },
  { key: 'WEEKLY', label: 'Every week' },
  { key: 'FORTNIGHTLY', label: 'Every fortnight' },
  { key: 'MONTHLY', label: 'Monthly (same weekday)' },
] as const

export type CommunityRecurrence = (typeof COMMUNITY_RECURRENCE)[number]['key']

/** Submissions per email and per network, rolling 24 hours. */
export const COMMUNITY_RATE_LIMIT = 5
/** Kept for callers. The live threshold is `assessIndexability` in lib/indexability.ts. */
export const COMMUNITY_MIN_SECTION = 5
export const COMMUNITY_MIN_PLACE = 5
export const COMMUNITY_MAX_AHEAD_DAYS = 365
export const COMMUNITY_MAX_RECUR_DAYS = 182
export const COMMUNITY_MAX_SPAN_DAYS = 14
export const COMMUNITY_HOLD_REPORTS = 3

/** AND-clauses for public event queries. Ingested rows have a null approval state and stay visible. */
export const PUBLIC_EVENT_AND: Array<{ deletedAt: null } | { OR: Array<{ approvalState: null | string }> }> = [
  { deletedAt: null },
  { OR: [{ approvalState: null }, { approvalState: 'APPROVED' }] },
]

const TICKET_HOST = /ticketmaster|ticketek|eventbrite|humanitix|moshtix|oztix|trybooking|stickytickets|universe\.com|dice\.fm/i
const STREET = /\b\d{1,5}\s+[A-Za-z0-9][A-Za-z0-9.'’\-]*(?:\s+[A-Za-z0-9.'’\-]+){0,5}\s+(?:st|street|rd|road|ave|avenue|pde|parade|dr|drive|way|cres|crescent|cl|close|lane|ln|tce|terrace|pl|place|blvd|circuit|cct)\b\.?/gi
const PRIVATE = /\b(birthday party|bday party|invite[- ]only|invitation[- ]only|by invitation|private (party|function|event|gathering)|wedding (reception|ceremony)|hens? (night|party)|bucks? (night|party)|baby shower|engagement party|family only|guests only)\b/i
const BANNED = /\b(crypto|bitcoin|forex|casino|betting tips|viagra|cialis|escort|onlyfans|payday loan|make money fast|work from home income|weight ?loss pills?|adult (content|services)|xxx)\b/i
const WEAPONS = /\b(guns?|firearms?|ammunition|ammo|vapes?|nicotine|prescription (drugs|meds))\s+(for sale|sale|available)\b/i

const GENRE_FILE: Record<string, string> = {
  Music: 'music',
  'Arts & Culture': 'arts',
  Sports: 'sports',
  'Food & Drink': 'food',
  Family: 'family',
  Nightlife: 'nightlife',
  Community: 'community',
  Business: 'business',
  Wellness: 'wellness',
  Education: 'education',
}

export const sectionByKey = (key: string | null | undefined) => COMMUNITY_SECTIONS.find((s) => s.key === key) ?? null
export const isSchoolSection = (key: string | null | undefined) => key === 'school-fundraisers'
export const isCommunityRecurrence = (value: string): value is CommunityRecurrence => COMMUNITY_RECURRENCE.some((r) => r.key === value)

export function placeholderSrc(category?: string | null, communityKey?: string | null): string {
  if (sectionByKey(communityKey)) return `/placeholders/${communityKey}.webp`
  return `/placeholders/${GENRE_FILE[category ?? ''] ?? 'community'}.webp`
}

export function looksLikeStreetAddress(value: string | null | undefined): boolean {
  if (!value) return false
  STREET.lastIndex = 0
  return STREET.test(value)
}

export function stripStreetAddresses(text: string): string {
  STREET.lastIndex = 0
  return text.replace(STREET, 'nearby').replace(/\s{2,}/g, ' ').trim()
}

/** Ingested listings pass through. Community listings hide the street unless the organiser opted in, and school listings always do. */
export function redactCommunityPublic<T extends {
  communityKey?: string | null
  locationVisibility?: string | null
  venueName?: string | null
  venueAddress?: string | null
  suburb?: string | null
  latitude?: number | null
  longitude?: number | null
  description?: string | null
  imageUrl?: string | null
  childrenInImage?: boolean | null
  imageKidSafe?: boolean | null
  communityFlags?: string[] | null
}>(ev: T): T {
  if (!ev.communityKey) return ev
  const school = isSchoolSection(ev.communityKey)
  const precise = !school && ev.locationVisibility === 'PRECISE'
  const next: T = { ...ev }
  if (!precise) {
    next.venueAddress = null
    next.latitude = null
    next.longitude = null
    if (looksLikeStreetAddress(next.venueName)) next.venueName = ev.suburb || 'Neighbourhood spot'
    if (typeof next.description === 'string') next.description = stripStreetAddresses(next.description)
  }
  if (school) {
    next.venueAddress = null
    next.latitude = null
    next.longitude = null
    next.locationVisibility = 'SUBURB'
    if (looksLikeStreetAddress(next.venueName)) next.venueName = ev.suburb ? `School event in ${ev.suburb}` : 'School event'
    if (typeof next.description === 'string') next.description = stripStreetAddresses(next.description)
  }
  const flaggedImage = (ev.communityFlags ?? []).includes('SCHOOL_IMAGE')
  if (ev.childrenInImage || flaggedImage || (school && !ev.imageKidSafe)) next.imageUrl = null
  return next
}

const PRIVATE_EVENT_KEYS = ['contactEmail', 'submitIpHash', 'manageTokenHash', 'emailVerifiedAt', 'communityFlags'] as const

/** Fields that must never reach a public JSON payload. */
export function omitCommunitySecrets<T extends Record<string, unknown>>(ev: T): T {
  const next = { ...ev }
  for (const key of PRIVATE_EVENT_KEYS) delete next[key]
  return next
}

export function listingCta(ev: {
  id?: string | null
  title?: string | null
  ticketUrl?: string | null
  organiserUrl?: string | null
  communityKey?: string | null
  source?: string | null
}): { href: string; label: 'Get Tickets' | 'More Info'; external: boolean } | null {
  const community = !!(ev.communityKey || ev.source === 'community')
  const ticket = (ev.ticketUrl ?? '').trim()
  const site = (ev.organiserUrl ?? '').trim()
  const own = ev.id ? eventPath({ id: ev.id, title: ev.title }) : ''
  if (ticket && TICKET_HOST.test(ticket)) return { href: ticket, label: 'Get Tickets', external: true }
  if (community) {
    const href = ticket || site || own
    if (!href) return null
    return { href, label: 'More Info', external: /^https?:\/\//i.test(href) }
  }
  if (ticket) return { href: ticket, label: 'Get Tickets', external: /^https?:\/\//i.test(ticket) }
  if (site && /^https?:\/\//i.test(site)) return { href: site, label: 'More Info', external: true }
  return null
}

export interface CommunityInput {
  title: string
  communityKey: CommunityKey
  description: string
  suburb: string
  city: string
  startDate: string
  startTime: string
  endTime: string | null
  endDate: string | null
  recurrence: CommunityRecurrence
  recurUntil: string | null
  placeName: string | null
  streetAddress: string | null
  showPrecise: boolean
  organiserName: string
  contactEmail: string
  websiteUrl: string | null
  isFree: boolean
  priceNote: string | null
  imageUrl: string | null
  childrenInImage: boolean
  imageKidSafe: boolean
  locationVisibility: 'SUBURB' | 'PRECISE'
  boardCategory: string
  subTags: string[]
}

export interface CommunityDecision {
  input: CommunityInput
  flags: string[]
  review: boolean
  /** Street text the organiser typed for a school. Kept off the listing. */
  droppedSchoolAddress: boolean
}

const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export function spamSignals(title: string, description: string, filledMs: number | null): string[] {
  const flags: string[] = []
  const text = `${title} ${description}`
  if (filledMs !== null && filledMs >= 800 && filledMs < 4000) flags.push('FAST')
  if ((text.match(/https?:\/\//g) ?? []).length > 2) flags.push('SPAM')
  if (title.length > 12 && title === title.toUpperCase() && /[A-Z]/.test(title)) flags.push('SPAM')
  if (/(.)\1{6,}/.test(text)) flags.push('SPAM')
  if (/\b(whatsapp|telegram|dm me|text me on)\b/i.test(text) && /\+?\d[\d\s]{8,}/.test(text)) flags.push('SPAM')
  return [...new Set(flags)]
}

/**
 * Validates a community submission.
 * `now` is injectable so tests do not depend on the clock.
 */
export function parseCommunity(body: Record<string, unknown>, now = new Date()): { error: string } | CommunityDecision {
  if (clean(body.company, 80)) return { error: 'That listing could not be accepted.' }
  const communityKey = clean(body.communityKey, 40)
  const section = sectionByKey(communityKey)
  if (!section) return { error: 'Pick a community category to get started.' }
  const title = clean(body.title, 100)
  const description = String(body.description ?? '').trim().slice(0, 1500)
  const city = clean(body.city, 40)
  const suburb = clean(body.suburb, 60)
  if (title.length < 5) return { error: 'Give it a title of at least 5 characters.' }
  if (description.length < 20) return { error: 'Tell people what’s on, in at least a sentence.' }
  if (!CITIES.some((c) => c.name === city)) return { error: 'Pick a city we cover.' }
  if (suburb.length < 2) return { error: 'Add the suburb so neighbours can find it.' }
  if (looksLikeStreetAddress(suburb)) return { error: 'Pop the suburb in that box, not the street address.' }

  const tz = CITIES.find((c) => c.name === city)!.tz
  const today = todayIn(tz)
  if (!isDateStr(body.startDate)) return { error: 'Pick a date.' }
  const startDate = body.startDate
  if (startDate < today) return { error: 'That date has already packed up. Pick today or a day ahead.' }
  if (diffDays(today, startDate) > COMMUNITY_MAX_AHEAD_DAYS) return { error: 'Listings can go up to a year ahead.' }
  if (!isTimeStr(body.startTime)) return { error: 'Add a start time.' }
  const endTime = body.endTime ? clean(body.endTime, 5) : ''
  if (endTime && !isTimeStr(endTime)) return { error: 'That finish time doesn’t look right.' }
  if (endTime && endTime <= body.startTime) return { error: 'The finish time needs to be after the start.' }

  const recurrence = clean(body.recurrence, 20) || 'NONE'
  if (!isCommunityRecurrence(recurrence)) return { error: 'Pick how often it runs.' }
  let endDate: string | null = null
  let recurUntil: string | null = null
  if (recurrence === 'NONE') {
    if (body.endDate && isDateStr(body.endDate) && body.endDate > startDate) {
      if (diffDays(startDate, body.endDate) >= COMMUNITY_MAX_SPAN_DAYS) return { error: `A one-off listing can run for up to ${COMMUNITY_MAX_SPAN_DAYS} days.` }
      endDate = body.endDate
    }
  } else {
    const cap = addDaysStr(startDate, COMMUNITY_MAX_RECUR_DAYS)
    recurUntil = body.recurUntil && isDateStr(body.recurUntil) ? (body.recurUntil < cap ? body.recurUntil : cap) : cap
    if (recurUntil < startDate) return { error: 'The repeat-until date is before the first date.' }
  }

  const contactEmail = clean(body.contactEmail, 200).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return { error: 'Add a real contact email. It stays off the public page and we use it to send your code.' }
  const organiserName = clean(body.organiserName, 80)
  if (organiserName.length < 2) return { error: 'Add the name that should appear on the listing.' }
  let websiteUrl: string | null = clean(body.websiteUrl, 300) || null
  if (websiteUrl) {
    try {
      const url = new URL(/^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`)
      if (!/^https?:$/i.test(url.protocol)) throw new Error('bad')
      websiteUrl = url.toString()
    } catch {
      return { error: 'That website link doesn’t look right.' }
    }
  }
  if (body.isPublic !== true) return { error: 'Confirm this is open to the public. Private gatherings stay off VibePeep.' }

  const text = `${title} ${description}`
  if (PRIVATE.test(text)) return { error: 'VibePeep community listings are for things neighbours can actually turn up to. Private or invitation-only gatherings can’t be listed.' }
  if (BANNED.test(text) || WEAPONS.test(text)) return { error: 'This listing includes something we can’t publish.' }

  const startedAt = typeof body.startedAt === 'number' ? body.startedAt : null
  const filledMs = startedAt && startedAt < now.getTime() && now.getTime() - startedAt < 86_400_000 ? now.getTime() - startedAt : null
  if (filledMs !== null && filledMs < 800) return { error: 'That was a bit too speedy. Give the form another go.' }

  const school = isSchoolSection(section.key)
  const placeName = clean(body.placeName, 120) || null
  let streetAddress = clean(body.streetAddress, 160) || null
  const showPrecise = body.showPrecise === true && !school
  const flags = spamSignals(title, description, filledMs)
  let droppedSchoolAddress = false
  if (school && (streetAddress || (placeName && looksLikeStreetAddress(placeName)) || looksLikeStreetAddress(description))) {
    flags.push('SCHOOL_ADDRESS')
    droppedSchoolAddress = true
    streetAddress = null
  }
  if (school) flags.push('SCHOOL')
  const storedDescription = school ? stripStreetAddresses(description) : description

  const childrenInImage = body.childrenInImage === true
  const imageKidSafe = body.imageKidSafe === true && !childrenInImage
  const imageUrl = clean(body.imageUrl, 500) || null
  if (imageUrl && body.imageRights !== true) return { error: 'Confirm you can use that photo, or remove it.' }
  if (childrenInImage) flags.push('CHILDREN_IMAGE')
  if (school && imageUrl && !imageKidSafe) flags.push('SCHOOL_IMAGE')

  const safePlace = placeName && !looksLikeStreetAddress(placeName) ? placeName : null
  const optedStreet = streetAddress || (placeName && looksLikeStreetAddress(placeName) ? placeName : null)
  const locationVisibility: 'SUBURB' | 'PRECISE' = !school && showPrecise && optedStreet && looksLikeStreetAddress(optedStreet) ? 'PRECISE' : 'SUBURB'
  if (body.showPrecise === true && school) flags.push('SCHOOL_ADDRESS')

  const review = flags.some((f) => f === 'SCHOOL' || f === 'SCHOOL_ADDRESS' || f === 'SCHOOL_IMAGE' || f === 'CHILDREN_IMAGE' || f === 'SPAM' || f === 'FAST')
  return {
    input: {
      title,
      communityKey: section.key,
      description: storedDescription,
      suburb,
      city,
      startDate,
      startTime: body.startTime,
      endTime: endTime || null,
      endDate: recurrence === 'NONE' ? endDate : recurUntil,
      recurrence,
      recurUntil,
      placeName: safePlace,
      streetAddress: locationVisibility === 'PRECISE' ? optedStreet : null,
      showPrecise,
      organiserName,
      contactEmail,
      websiteUrl,
      isFree: body.isFree !== false,
      priceNote: clean(body.priceNote, 80) || null,
      imageUrl,
      childrenInImage,
      imageKidSafe,
      locationVisibility,
      boardCategory: section.boardCategory,
      subTags: [...section.subTags],
    },
    flags: [...new Set(flags)],
    review,
    droppedSchoolAddress,
  }
}

export function overRateLimit(recentCount: number): boolean {
  return recentCount >= COMMUNITY_RATE_LIMIT
}

export function moderationResult(action: 'approve' | 'reject' | 'remove' | 'hold'): {
  approvalState: 'APPROVED' | 'REJECTED' | 'REMOVED' | 'PENDING'
  softDelete: boolean
  audit: 'APPROVE' | 'REJECT' | 'REMOVE' | 'HOLD'
} {
  switch (action) {
    case 'approve':
      return { approvalState: 'APPROVED', softDelete: false, audit: 'APPROVE' }
    case 'reject':
      return { approvalState: 'REJECTED', softDelete: false, audit: 'REJECT' }
    case 'remove':
      return { approvalState: 'REMOVED', softDelete: true, audit: 'REMOVE' }
    default:
      return { approvalState: 'PENDING', softDelete: false, audit: 'HOLD' }
  }
}

export interface CommunityOccurrence {
  id: string
  communityKey: string
  city: string
  suburb: string | null
  date: string
  endDate: string | null
  recurrence: string | null
  time: string | null
  isFree: boolean
  status: string
}

/** Dates a listing occupies inside an inclusive YYYY-MM-DD window. Cancelled rows stay so the date filter can show the cancellation. */
export function datesForListing(ev: CommunityOccurrence, from: string, to: string): string[] {
  if (!ev.date || ev.date > to) return []
  const pattern = ev.recurrence === 'MONTHLY' ? 'MONTHLY_NTH' : ev.recurrence && ev.recurrence !== 'NONE' ? ev.recurrence : 'NONE'
  if (pattern !== 'NONE' && ev.endDate && ev.endDate < from) return []
  return occurrences({
    startDate: ev.date,
    endDate: pattern === 'NONE' ? ev.endDate : null,
    recurrence: pattern,
    recurUntil: pattern === 'NONE' ? null : ev.endDate,
  }, from, to)
}

export interface CommunityFilter {
  section?: string | null
  city?: string | null
  suburb?: string | null
  from: string
  to: string
  free?: boolean
  when?: WhenKey | null
}

export function suburbMatches(stored: string | null | undefined, want: string): boolean {
  const raw = (stored ?? '').trim()
  const needle = want.trim()
  if (!raw || !needle) return false
  return raw.toLowerCase() === needle.toLowerCase() || slugify(raw) === slugify(needle)
}

/**
 * Applies category, city, suburb, free and date filters.
 * A weekly listing matches a date only when an occurrence falls in the window.
 */
export function filterCommunityListings<T extends CommunityOccurrence>(rows: T[], filters: CommunityFilter, city: CityDef): Array<T & { occursOn: string }> {
  const when = filters.when ? whenRange(city, filters.when) : null
  const from = when && when.from > filters.from ? when.from : filters.from
  const to = when && when.to < filters.to ? when.to : filters.to
  if (from > to) return []
  const out: Array<T & { occursOn: string }> = []
  for (const row of rows) {
    if (filters.section && row.communityKey !== filters.section) continue
    if (filters.city && row.city !== filters.city) continue
    if (filters.suburb && !suburbMatches(row.suburb, filters.suburb)) continue
    if (filters.free && !row.isFree) continue
    let dates = datesForListing(row, from, to)
    if (filters.when === 'tonight') dates = dates.filter(() => isTonightSlot(row.time))
    for (const occursOn of dates) out.push({ ...row, occursOn })
  }
  return out.sort((a, b) => a.occursOn.localeCompare(b.occursOn) || (a.time ?? '').localeCompare(b.time ?? ''))
}

export type CommunityPageKind = 'section' | 'city' | 'suburb' | 'date'

export function freshListingCount(rows: { id: string; occursOn: string }[], from: string): number {
  const until = addDaysKey(from, INDEX_FRESH_DAYS)
  return new Set(rows.filter((row) => row.occursOn <= until).map((row) => row.id)).size
}

/** Same gate as the city guides. Dated pages skip the freshness check because the URL is already a date window. */
export function communityPageIndexable(listingCount: number, kind: CommunityPageKind, fresh?: number): boolean {
  return assessIndexability({
    total: listingCount,
    fresh: fresh ?? listingCount,
    requireFresh: kind === 'suburb',
    mode: kind === 'section' || kind === 'city' ? 'editorial' : 'combo',
  }).index
}

export function communitySectionPath(key: string): string {
  return `/community/${key}`
}

export function communityCityPath(key: string, city: string): string {
  return `/community/${key}/${citySlug(city)}`
}

export function communityPlacePath(key: string, city: string, place: string): string {
  return `/community/${key}/${citySlug(city)}/${slugify(place)}`
}

export const isWhenKey = (value: string): value is WhenKey => (WHEN_KEYS as readonly string[]).includes(value)

export function defaultWindow(city: CityDef, now = new Date()): { from: string; to: string } {
  const from = cityToday(city, now)
  return { from, to: addDaysKey(from, 120) }
}

export const COMMUNITY_PRESETS: Array<{
  key: string
  label: string
  communityKey: CommunityKey
  startTime: string
  endTime: string
  recurrence: CommunityRecurrence
  description: string
  isFree: boolean
}> = [
  { key: 'saturday-garage', label: 'Saturday garage sale', communityKey: 'garage-sales', startTime: '08:00', endTime: '13:00', recurrence: 'NONE', description: 'Household goods out the front. Cash is easiest. Come past during the hours on the listing.', isFree: true },
  { key: 'monthly-market', label: 'Monthly farmers market', communityKey: 'farmers-markets', startTime: '08:00', endTime: '12:30', recurrence: 'MONTHLY', description: 'Local produce, coffee and a few makers. Same weekday each month. Details can change, so check back before you go.', isFree: true },
  { key: 'dog-walk', label: 'Sunday dog meetup', communityKey: 'dog-friendly', startTime: '09:00', endTime: '10:00', recurrence: 'WEEKLY', description: 'A friendly off-lead wander for local dogs and their people. Bring water. The meeting point is the suburb on this listing.', isFree: true },
  { key: 'school-fete', label: 'School fete (suburb only)', communityKey: 'school-fundraisers', startTime: '10:00', endTime: '15:00', recurrence: 'NONE', description: 'A public school fete with stalls and a sausage sizzle. The public listing shows the suburb only.', isFree: true },
]

export function presetByKey(key: string | null | undefined) {
  return COMMUNITY_PRESETS.find((p) => p.key === key) ?? null
}
