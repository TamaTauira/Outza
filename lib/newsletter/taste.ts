import { ageOn, areaForPostcode } from '@/lib/profile-shared'
import { sourceLabel } from '@/lib/quality'
import { coordsFitCity, estimateLeg, fmtMin } from '@/lib/travel'
import { VIBE_CATEGORIES, asVibe, type VibeProfile } from '@/lib/vibe-shared'

/**
 * Pure personalisation for one digest. No database, no confidence scores, no "Verified" wording.
 * View rows are EventSignal kind VIEW (signed-in event pages only). Searches are not stored per person.
 */

const BOOKABLE = new Set(['SCHEDULED', 'RESCHEDULED'])
const ADULTS = /(18\s*\+|R18\b|over\s*18\b|21\s*\+|strictly\s*18\b)/i
const SOLD = /\b(sold[- ]?out|cancell?ed|postponed)\b/i

const FRIENDLY: Record<string, string> = {
  Music: 'live music',
  Nightlife: 'nightlife',
  'Food & Drink': 'food and bars',
  'Arts & Culture': 'arts and theatre',
  Community: 'community events',
  Sports: 'sport',
  Wellness: 'wellness',
  Education: 'workshops',
  Business: 'work events',
  Family: 'family outings',
  Comedy: 'comedy',
}

const PERSONAL_WHY = new Set(['saved-like', 'viewed', 'viewed-category', 'interest', 'vibe', 'venue', 'clicked', 'lgbtiq', 'family', 'together', 'itinerary'])
const COMEDY_KEYS = new Set(['comedy', 'stand-up', 'standup', 'stand up'])

export interface DigestEvent {
  id: string
  title: string
  description: string | null
  date: Date
  endDate: Date | null
  time: string | null
  venueName: string
  suburb: string | null
  city: string
  category: string
  subTags: string[]
  isFree: boolean
  isLGBTI: boolean
  priceMin: number | null
  imageUrl: string | null
  hasImage: boolean
  ageRestriction: string | null
  latitude: number | null
  longitude: number | null
  status: string
  duplicateOfId: string | null
  source: string
  lastVerifiedAt: Date | null
  updatedAt: Date
  popularity: number
  createdAt: Date
}

export interface TasteAnchor {
  id: string
  title: string
  category: string
  venueName: string
  suburb: string | null
  subTags: string[]
}

export interface TasteProfile {
  firstName: string
  greeting: string
  intro: string
  city: string
  homeArea: string | null
  thin: boolean
  interests: Set<string>
  venueNames: string[]
  suburbWeights: Map<string, number>
  categoryWeights: Map<string, number>
  clickWeights: Map<string, number>
  savedIds: Set<string>
  viewedIds: Set<string>
  togetherIds: Set<string>
  itineraryIds: Set<string>
  savedCategories: Map<string, number>
  viewedCategories: Map<string, number>
  savedComedy: boolean
  anchors: TasteAnchor[]
  tasteBits: string[]
  freeOnly: boolean
  freeRelevant: boolean
  maxPrice: number | null
  family: boolean
  minor: boolean
  lgbtiq: boolean
  vibeLabels: string[]
  vibeCategories: Set<string>
  reminderOptIn: boolean
  becauseTitle: string | null
}

export interface RankOpts {
  from: Date
  to: Date
  savedUntil: Date
  todayKey: string
  nowMin: number
  weekend: { from: string; to: string }
  seen: Set<string>
  promoIds: Set<string>
}

export type Scored<T extends DigestEvent = DigestEvent> = T & {
  score: number
  why: string[]
  whyLine: string
  travel: string | null
}

export interface DigestSelection<T extends DigestEvent = DigestEvent> {
  hero: Scored<T> | null
  weekend: Scored<T>[]
  because: Scored<T>[]
  saved: Scored<T>[]
  free: Scored<T>[]
  popular: Scored<T>[]
  usedIds: string[]
  nearTitle: string
  becauseTitle: string | null
  greeting: string
  intro: string
  thin: boolean
}

interface Reason { code: string; points: number; line: string }

export function friendlyCategory(category: string): string {
  const hit = Object.keys(FRIENDLY).find((k) => k.toLowerCase() === category.toLowerCase())
  return hit ? FRIENDLY[hit] : category.toLowerCase()
}

export function firstName(name: string | null | undefined): string {
  const token = (name ?? '').trim().split(/\s+/)[0] ?? ''
  const clean = token.replace(/[^\p{L}'’-]/gu, '')
  if (clean.length < 2 || clean.length > 24) return ''
  return clean
}

export function digestGreeting(name: string | null | undefined): string {
  const first = firstName(name)
  return first ? `Hey ${first},` : 'Hey there,'
}

function joinBits(bits: string[]): string {
  if (bits.length <= 1) return bits[0] ?? ''
  if (bits.length === 2) return `${bits[0]} and ${bits[1]}`
  return `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}`
}

export function digestIntro(profile: { thin: boolean; city: string; homeArea: string | null; tasteBits: string[] }): string {
  if (profile.thin) {
    const place = profile.homeArea ? `${profile.city} (${profile.homeArea})` : profile.city
    return `You're new on our radar in ${place}. Follow a category or a venue, save something you like, and the next one gets dangerously you.`
  }
  if (!profile.tasteBits.length) {
    return `${profile.city} has a good week on. We lined this up from the categories, venues and saves you asked to be emailed about.`
  }
  return `You've been peeping at ${joinBits(profile.tasteBits)}, so this one's lined up around that.`
}

function spendCap(spend: string | undefined): { freeOnly: boolean; max: number | null } {
  switch (spend) {
    case 'Free is my favourite price': return { freeOnly: true, max: 0 }
    case 'Under $30': return { freeOnly: false, max: 30 }
    case '$30–$80': return { freeOnly: false, max: 80 }
    case '$80–$150': return { freeOnly: false, max: 150 }
    default: return { freeOnly: false, max: null }
  }
}

function bump(map: Map<string, number>, key: string | null | undefined, n = 1) {
  const k = key?.trim().toLowerCase()
  if (!k) return
  map.set(k, (map.get(k) ?? 0) + n)
}

function weight(map: Map<string, number>, key: string | null | undefined): number {
  if (!key) return 0
  return map.get(key.trim().toLowerCase()) ?? 0
}

function share(map: Map<string, number>, key: string | null | undefined): number {
  const total = [...map.values()].reduce((a, b) => a + b, 0)
  if (!total || !key) return 0
  return weight(map, key) / total
}

function topKey(map: Map<string, number>): string | null {
  let best: string | null = null
  let n = 0
  for (const [k, v] of map) if (v > n) { best = k; n = v }
  return best
}

export interface TasteSource {
  name: string | null
  city: string
  homePostcode?: string | null
  preferredCategories: string[]
  vibe?: unknown
  birthDate?: Date | null
  reminderOptIn?: boolean
  venueNames: string[]
  saved: TasteAnchor[]
  attended?: TasteAnchor[]
  viewed?: TasteAnchor[]
  ticketed?: TasteAnchor[]
  itinerary?: TasteAnchor[]
  together?: TasteAnchor[]
  clickedCategories?: string[]
  freeCount?: number
  paidPrices?: number[]
}

function pushBit(bits: string[], bit: string) {
  const key = bit.toLowerCase()
  if (!bit || bits.some((b) => b.toLowerCase() === key || b.toLowerCase().includes(key) || key.includes(b.toLowerCase()))) return
  bits.push(bit)
}

function displayKey(map: Map<string, number>, labels: Map<string, string>): string | null {
  const key = topKey(map)
  if (!key) return null
  return labels.get(key) ?? key
}

function remember(weights: Map<string, number>, labels: Map<string, string>, raw: string | null | undefined, n: number) {
  const pretty = raw?.trim()
  if (!pretty) return
  bump(weights, pretty, n)
  labels.set(pretty.toLowerCase(), pretty)
}

/** Intro bits name only what this person asked to be emailed about. */
function emailTasteBits(interests: string[], venues: string[], suburb: string | null): string[] {
  const bits: string[] = []
  for (const interest of interests) {
    const key = interest.trim()
    if (!key) continue
    pushBit(bits, key.toLowerCase() === 'comedy' ? 'comedy' : friendlyCategory(key))
    if (bits.length >= 2) break
  }
  if (bits.length < 2 && venues[0]?.trim()) pushBit(bits, venues[0].trim())
  if (bits.length < 2 && suburb) pushBit(bits, suburb)
  return bits.slice(0, 2)
}

function becauseHeading(anchors: TasteAnchor[]): string | null {
  const anchor = anchors[0]
  if (!anchor) return null
  const comedy = /comedy|stand-?up/i.test(`${anchor.category} ${anchor.title} ${anchor.subTags.join(' ')}`)
  if (comedy) return 'Because you liked comedy'
  if (anchor.category === 'Music') return 'Because you liked that gig'
  return `Because you liked ${friendlyCategory(anchor.category)}`
}

function hasInterest(profile: TasteProfile, name: string): boolean {
  const key = name.trim().toLowerCase()
  if (!key) return false
  for (const raw of profile.interests) if (raw.trim().toLowerCase() === key) return true
  return false
}

function comedyOptIn(profile: TasteProfile): boolean {
  for (const raw of profile.interests) if (COMEDY_KEYS.has(raw.trim().toLowerCase())) return true
  return false
}

export interface ScopeEvent {
  id: string
  title: string
  description: string | null
  category: string
  subTags: string[]
  venueName: string
}

/**
 * An event may appear only when the recipient asked to be emailed about it:
 * a digest category or followed interest, a followed venue, or that exact saved event.
 * Views, vibe answers and lookalike saves can re-rank inside that set. They cannot add a category.
 */
export function inDigestScope(event: ScopeEvent, profile: TasteProfile): boolean {
  if (profile.savedIds.has(event.id)) return true
  if (venueHit(event.venueName, profile.venueNames)) return true
  return matchesExplicitInterest(event, profile)
}

function matchesExplicitInterest(event: ScopeEvent, profile: TasteProfile): boolean {
  if (hasInterest(profile, event.category)) return true
  if (comedyOptIn(profile) && comedyish(event)) return true
  return false
}

function askedWhy(event: ScopeEvent, profile: TasteProfile): string {
  if (profile.savedIds.has(event.id)) return 'On your watchlist'
  const venue = venueHit(event.venueName, profile.venueNames)
  if (venue) return `Because you follow ${event.venueName}`
  if (comedyOptIn(profile) && comedyish(event)) return 'Because you follow comedy'
  if (hasInterest(profile, event.category)) return `Because you follow ${event.category}`
  return `Worth a peep in ${profile.city}`
}

export function buildProfile(src: TasteSource): TasteProfile {
  const vibe = asVibe(src.vibe)
  const vibeLabels = vibe.vibes ?? []
  const vibeCategories = new Set(vibeLabels.flatMap((v) => VIBE_CATEGORIES[v] ?? []))
  const family = vibeLabels.includes('Family fun') || (vibe.crew ?? []).includes('Family with kids')
  const lgbtiq = vibeLabels.includes('LGBTIQ+ scene')
  const spend = spendCap(vibe.spend?.[0])
  const minor = src.birthDate ? ageOn(src.birthDate) < 18 : false
  const suburbWeights = new Map<string, number>()
  const suburbLabels = new Map<string, string>()
  const categoryWeights = new Map<string, number>()
  const categoryLabels = new Map<string, string>()
  const savedCategories = new Map<string, number>()
  const viewedCategories = new Map<string, number>()
  const clickWeights = new Map<string, number>()
  const touch = (row: TasteAnchor | undefined, n: number, bucket?: Map<string, number>) => {
    if (!row) return
    remember(categoryWeights, categoryLabels, row.category, n)
    remember(suburbWeights, suburbLabels, row.suburb, n)
    if (bucket) remember(bucket, categoryLabels, row.category, 1)
    for (const tag of row.subTags) remember(categoryWeights, categoryLabels, tag, Math.max(1, n - 1))
  }
  for (const row of src.saved) touch(row, 3, savedCategories)
  for (const row of src.attended ?? []) touch(row, 2, savedCategories)
  for (const row of src.viewed ?? []) touch(row, 2, viewedCategories)
  for (const row of src.ticketed ?? []) touch(row, 3, viewedCategories)
  for (const row of src.itinerary ?? []) touch(row, 2)
  for (const row of src.together ?? []) touch(row, 2, savedCategories)
  for (const cat of src.clickedCategories ?? []) remember(clickWeights, categoryLabels, cat, 1)
  for (const cat of src.preferredCategories) remember(categoryWeights, categoryLabels, cat, 2)

  const prices = (src.paidPrices ?? []).filter((n) => n > 0).sort((a, b) => a - b)
  const historyBudget = prices.length >= 3 ? prices[Math.floor(prices.length / 2)] : null
  const freeCount = src.freeCount ?? 0
  const history = src.saved.length + (src.attended?.length ?? 0)
  const freeRatio = history ? freeCount / history : 0
  const freeOnly = spend.freeOnly
  const maxPrice = spend.max ?? (historyBudget != null ? Math.round(historyBudget * 1.5) : null)
  const freeRelevant = freeOnly || (maxPrice != null && maxPrice <= 80) || freeRatio >= 0.3

  const anchors = [...src.saved, ...(src.viewed ?? []), ...(src.together ?? [])]
  const signals = src.preferredCategories.length + src.venueNames.length + src.saved.length
    + (src.viewed?.length ?? 0) + (src.together?.length ?? 0) + (src.attended?.length ?? 0)
    + (src.clickedCategories?.length ?? 0) + vibeLabels.length + (src.itinerary?.length ?? 0)
  const thin = signals === 0
  const homeArea = areaForPostcode(src.homePostcode)
  const suburb = displayKey(suburbWeights, suburbLabels)
  const bits = emailTasteBits(src.preferredCategories, src.venueNames, suburb)
  const savedComedy = [...src.saved, ...(src.attended ?? [])].some((row) => /comedy|stand-?up/i.test(`${row.category} ${row.title} ${row.subTags.join(' ')}`))
  const greeting = digestGreeting(src.name)
  const intro = digestIntro({ thin, city: src.city, homeArea, tasteBits: bits })

  return {
    firstName: firstName(src.name),
    greeting,
    intro,
    city: src.city,
    homeArea,
    thin,
    interests: new Set(src.preferredCategories),
    venueNames: src.venueNames,
    suburbWeights,
    categoryWeights,
    clickWeights,
    savedIds: new Set(src.saved.map((s) => s.id)),
    viewedIds: new Set((src.viewed ?? []).map((s) => s.id)),
    togetherIds: new Set((src.together ?? []).map((s) => s.id)),
    itineraryIds: new Set((src.itinerary ?? []).map((s) => s.id)),
    savedCategories,
    viewedCategories,
    savedComedy,
    anchors,
    tasteBits: bits,
    freeOnly,
    freeRelevant,
    maxPrice,
    family,
    minor,
    lgbtiq,
    vibeLabels,
    vibeCategories,
    reminderOptIn: !!src.reminderOptIn,
    becauseTitle: becauseHeading(anchors),
  }
}

export function trustLine(source: string | null | undefined, updated: Date | null | undefined): string | null {
  if (!source || !updated || Number.isNaN(updated.getTime())) return null
  const label = sourceLabel(source).replace(/\bverified\b/ig, '').replace(/\s{2,}/g, ' ').trim()
  if (!label) return null
  const when = updated.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${label} · Updated ${when}`
}

function hay(e: { category: string; subTags: string[]; title: string; description: string | null }): string {
  return `${e.category} ${e.subTags.join(' ')} ${e.title} ${e.description ?? ''}`.toLowerCase()
}

function adultsOnly(e: DigestEvent): boolean {
  return ADULTS.test(`${e.ageRestriction ?? ''} ${hay(e)}`)
}

function comedyish(e: { category: string; subTags: string[]; title: string; description: string | null }): boolean {
  return /comedy|stand-?up/.test(hay(e))
}

function familyish(e: DigestEvent): boolean {
  return e.category === 'Family' || /family|kids|all ages|children/.test(hay(e))
}

function venueHit(name: string, follows: string[]): string | null {
  const n = name.toLowerCase()
  const hit = follows.find((v) => {
    const f = v.toLowerCase().trim()
    return f.length >= 4 && (n === f || n.includes(f) || f.includes(n))
  })
  return hit ?? null
}

function likeSaved(category: string, comedy: boolean): string {
  if (category === 'Music') return 'Like the gig you saved'
  if (comedy) return 'Like the comedy you saved'
  return `Like the ${friendlyCategory(category)} you saved`
}

export function scoreEvent<T extends DigestEvent>(event: T, profile: TasteProfile): Scored<T> {
  const reasons: Reason[] = []
  const add = (code: string, points: number, line: string) => {
    if (points >= 4) reasons.push({ code, points, line })
  }
  if (profile.togetherIds.has(event.id)) add('together', 42, 'On your Together plan')
  if (profile.savedIds.has(event.id)) add('saved', 40, 'On your watchlist')
  if (profile.itineraryIds.has(event.id)) add('itinerary', 30, 'You popped this on an itinerary')
  const venue = venueHit(event.venueName, profile.venueNames)
  if (venue) add('venue', 36, `Because you follow ${event.venueName}`)
  if (comedyOptIn(profile) && comedyish(event)) add('interest', 24, 'Because you follow comedy')
  else if (hasInterest(profile, event.category)) add('interest', 22, `Because you follow ${event.category}`)
  if (profile.vibeLabels.includes('Comedy') && comedyish(event)) add('vibe', 14, 'Lines up with your comedy vibe')
  else if (profile.vibeCategories.has(event.category)) add('vibe', 12, `Lines up with your ${friendlyCategory(event.category)} vibe`)
  if (profile.lgbtiq && event.isLGBTI) add('lgbtiq', 12, 'Because you follow the LGBTIQ+ scene')
  if (profile.viewedIds.has(event.id)) add('viewed', 26, 'You peeped at this')
  if (!profile.viewedIds.has(event.id) && !profile.savedIds.has(event.id) && weight(profile.viewedCategories, event.category) > 0) {
    add('viewed-category', 16, `Like the ${friendlyCategory(event.category)} you've been peeping at`)
  }
  const comedySave = profile.savedComedy && comedyish(event)
  if (!profile.savedIds.has(event.id) && (weight(profile.savedCategories, event.category) > 0 || comedySave)) {
    add('saved-like', 28, likeSaved(event.category, comedyish(event)))
  }
  if (weight(profile.suburbWeights, event.suburb) > 0) add('suburb', 18, `Near ${event.suburb}`)
  const clickShare = share(profile.clickWeights, event.category)
  if (clickShare >= 0.2) add('clicked', Math.max(10, clickShare * 14), `Because you opened ${friendlyCategory(event.category)} last time`)
  if (profile.family && familyish(event)) add('family', 16, 'Family-friendly, like your crew')
  if ((profile.freeOnly || profile.freeRelevant) && event.isFree) add('free', profile.freeOnly ? 18 : 10, 'Free, the way you like it')
  if (profile.maxPrice != null && event.priceMin != null && event.priceMin > 0 && event.priceMin <= profile.maxPrice) {
    add('budget', 8, 'Inside the spend you set')
  }
  let score = reasons.reduce((sum, r) => sum + r.points, 0)
  score += Math.log1p(event.popularity) * 6
  if (event.hasImage) score += 5
  if (Date.now() - event.createdAt.getTime() < 7 * 86400e3) score += 3
  if (profile.freeOnly && !event.isFree) score -= 28
  if (profile.maxPrice != null && event.priceMin != null && event.priceMin > profile.maxPrice * 1.25) score -= 12
  if ((profile.minor || profile.family) && adultsOnly(event)) score -= 40
  const line = [...reasons].filter((r) => r.line).sort((a, b) => b.points - a.points)[0]
  const whyLine = line?.line ?? askedWhy(event, profile)
  return { ...event, score, why: reasons.map((r) => r.code), whyLine, travel: null }
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 40)
}

function startedTooSoon(e: DigestEvent, opts: RankOpts): boolean {
  if (dayKey(e.date) !== opts.todayKey || !e.time) return false
  const [h, m] = e.time.split(':').map(Number)
  if (Number.isNaN(h)) return false
  return h * 60 + (m || 0) < opts.nowMin + 60
}

function eligible<T extends DigestEvent>(e: T, profile: TasteProfile, opts: RankOpts, saved: boolean): boolean {
  if (!BOOKABLE.has(e.status) || e.duplicateOfId) return false
  if (!e.title.trim() || !e.venueName.trim() || SOLD.test(e.title)) return false
  const last = dayKey(e.endDate ?? e.date)
  if (last < opts.todayKey) return false
  if (startedTooSoon(e, opts)) return false
  if (profile.minor && adultsOnly(e)) return false
  if (!saved && profile.family && adultsOnly(e)) return false
  const limit = saved ? opts.savedUntil : opts.to
  if (e.date < opts.from || e.date >= limit) return false
  if (!saved && e.city !== profile.city) return false
  if (!saved && (opts.seen.has(e.id) || opts.promoIds.has(e.id))) return false
  return true
}

function byScore<T extends DigestEvent>(a: Scored<T>, b: Scored<T>): number {
  return b.score - a.score || a.date.getTime() - b.date.getTime()
}

function byWhen<T extends DigestEvent>(a: Scored<T>, b: Scored<T>): number {
  const d = a.date.getTime() - b.date.getTime()
  if (d) return d
  return (a.time ?? '99:99').localeCompare(b.time ?? '99:99')
}

function takeVaried<T extends DigestEvent>(list: Scored<T>[], n: number, used: Set<string>, series: Set<string>, accept: (e: Scored<T>) => boolean): Scored<T>[] {
  const out: Scored<T>[] = []
  const cats = new Map<string, number>()
  const pass = (cap: number | null) => {
    for (const e of list) {
      if (out.length >= n) return
      if (used.has(e.id) || series.has(titleKey(e.title))) continue
      if (!accept(e)) continue
      if (cap != null && (cats.get(e.category) ?? 0) >= cap) continue
      out.push(e)
      used.add(e.id)
      series.add(titleKey(e.title))
      cats.set(e.category, (cats.get(e.category) ?? 0) + 1)
    }
  }
  pass(1)
  pass(2)
  pass(null)
  return out
}

function inWeekend(e: DigestEvent, weekend: { from: string; to: string }): boolean {
  const key = dayKey(e.date)
  return key >= weekend.from && key <= weekend.to
}

export function travelBetween(from: DigestEvent, to: DigestEvent): string | null {
  if (from.latitude == null || from.longitude == null || to.latitude == null || to.longitude == null) return null
  if (from.city && to.city && from.city !== to.city) return null
  if (!coordsFitCity(from.latitude, from.longitude, from.city) || !coordsFitCity(to.latitude, to.longitude, to.city)) return null
  const leg = estimateLeg({ lat: from.latitude, lng: from.longitude }, { lat: to.latitude, lng: to.longitude })
  if (leg.km < 0.15 || leg.km > 80) return null
  const mode = leg.mode === 'walking' ? 'walk' : 'drive'
  return `About ${fmtMin(leg.recommendedMin)} ${mode} from ${from.venueName}`
}

function applyTravel<T extends DigestEvent>(events: Scored<T>[], profile: TasteProfile) {
  const linked = events.filter((e) => profile.savedIds.has(e.id) || profile.togetherIds.has(e.id) || profile.itineraryIds.has(e.id))
  linked.sort(byWhen)
  for (let i = 1; i < linked.length; i++) {
    if (dayKey(linked[i].date) !== dayKey(linked[i - 1].date)) continue
    const note = travelBetween(linked[i - 1], linked[i])
    if (note) linked[i].travel = note
  }
}

function cheapEnough(e: DigestEvent, profile: TasteProfile): boolean {
  if (e.isFree) return true
  if (profile.freeOnly || e.priceMin == null || e.priceMin <= 0) return false
  return e.priceMin <= 30
}

function becauseTitleFor(event: DigestEvent, profile: TasteProfile): string {
  if (comedyish(event) && (comedyOptIn(profile) || hasInterest(profile, event.category) || hasInterest(profile, 'Arts & Culture'))) {
    return 'Because you liked comedy'
  }
  if (hasInterest(profile, event.category)) return `Because you follow ${friendlyCategory(event.category)}`
  const venue = venueHit(event.venueName, profile.venueNames)
  if (venue) return `Because you follow ${event.venueName}`
  if (profile.savedIds.has(event.id)) return 'Still on your list'
  return profile.becauseTitle ?? 'Picked for you'
}

function hasEmailAsk(profile: TasteProfile): boolean {
  return profile.interests.size > 0 || profile.savedIds.size > 0 || profile.venueNames.some((v) => v.trim().length >= 4)
}

export function rankDigest<T extends DigestEvent>(events: T[], profile: TasteProfile, opts: RankOpts): DigestSelection<T> {
  const empty: DigestSelection<T> = {
    hero: null, weekend: [], because: [], saved: [], free: [], popular: [], usedIds: [],
    nearTitle: 'Coming up near you', becauseTitle: null, greeting: profile.greeting, intro: profile.intro, thin: profile.thin,
  }
  // No category, venue or save to honour: send nothing rather than a city-wide mix.
  if (!hasEmailAsk(profile)) return empty

  const scored = events.map((e) => scoreEvent(e, profile)).sort(byScore)
  // Editorial slots stay inside followed categories and followed venues. A save does not open its category.
  const editorial = scored.filter((e) => eligible(e, profile, opts, false) && (matchesExplicitInterest(e, profile) || !!venueHit(e.venueName, profile.venueNames)))
  const used = new Set<string>()
  const series = new Set<string>()

  const savedPool = scored
    .filter((e) => profile.savedIds.has(e.id) && eligible(e, profile, opts, true))
    .sort(byWhen)
  const saved = takeVaried(savedPool, 3, used, series, () => true).sort(byWhen)

  const heroPool = editorial.filter((e) => !used.has(e.id))
  const pictured = heroPool.filter((e) => e.hasImage)
  let hero = pictured[0] ?? heroPool[0] ?? null
  if (hero && !hero.hasImage && pictured[0] && hero.score - pictured[0].score < 12) hero = pictured[0]
  if (!hero && saved.length) {
    const next = saved.shift()
    if (next) hero = next
  }
  if (hero) {
    used.add(hero.id)
    series.add(titleKey(hero.title))
  }

  const weekendPool = editorial.filter((e) => inWeekend(e, opts.weekend))
  const weekend = takeVaried(weekendPool, 3, used, series, () => true)
  let nearTitle = weekend.length ? 'This weekend near you' : 'Coming up near you'

  const because = profile.thin ? [] : takeVaried(editorial, 3, used, series, (e) => e.why.some((w) => PERSONAL_WHY.has(w)))
  const popular: Scored<T>[] = []
  const free = profile.freeRelevant ? takeVaried(editorial, 3, used, series, (e) => cheapEnough(e, profile)) : []

  if (!weekend.length && !profile.thin) {
    weekend.push(...takeVaried(editorial, 3, used, series, () => true))
    if (weekend.length) nearTitle = 'Coming up near you'
  }

  const placed = [hero, ...weekend, ...because, ...saved, ...free, ...popular].filter((e): e is Scored<T> => !!e)
  applyTravel(placed, profile)

  return {
    hero, weekend, because, saved, free, popular, usedIds: [...used],
    nearTitle, becauseTitle: because.length ? becauseTitleFor(because[0], profile) : null,
    greeting: profile.greeting, intro: profile.intro, thin: profile.thin,
  }
}

export type { VibeProfile }
