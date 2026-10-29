/**
 * Inventory-gated local landing pages for every supported city.
 *
 * Indexed URLs (only when the live count, freshness and distinctness gates pass):
 *   /{city}/{activity}/{when}                 markets in Sydney this weekend
 *   /{city}/{suburb}/{activity}               markets in Newtown
 *   /{city}/{suburb}/{when}                   things to do in Newtown on Sunday
 *   /{city}/{suburb}/{activity}/{when}        markets in Newtown on Sunday
 *
 * Primary guides (/{city}/{topic} and /{city}/{suburb}) stay as they are.
 * "Garage sales near me" is the city garage-sales guide plus suburb links — a
 * separate near-me URL would repeat the same listings.
 * Empty combinations 404. Near-duplicates redirect to the broader guide.
 * Thin and stale combinations render with noindex and stay out of the sitemap.
 */
import { conflictsWithMusicIntent } from '@/lib/categories'
import type { CityDef } from '@/lib/cities'
import {
  MIN_INDEX, TOPICS, WHEN_KEYS, addDaysKey, citySlug, cityToday, isLandingSuburb, isTonightSlot, slugify, topicDef, weekendRange,
  type TopicDef, type TopicKey, type WhenKey,
} from '@/lib/seo'

/** Undated suburb × activity pages need this many listings inside the fresh window. */
export const MIN_FRESH = 2
/** Days ahead that still count as fresh for an undated suburb × activity page. */
export const FRESH_DAYS = 28
/**
 * A narrower page is a near-duplicate when it contains at least this fraction of
 * its broader parent. 6 of the parent's 7 listings is not a distinct page.
 */
export const NEAR_DUP_RATIO = 0.85

const DATE_TOPICS = new Set<TopicKey>(['events', 'tonight', 'this-weekend'])
export const ACTIVITY_TOPICS: TopicDef[] = TOPICS.filter((t) => !DATE_TOPICS.has(t.key))

const MARKET_RE = /\bmarkets?\b/i
const POPUP_RE = /pop[- ]?up.{0,25}\b(sale|market|shop|store|stall|bazaar)s?\b/i
const WAREHOUSE_RE = /\b(warehouse|sample|clearance|stock|factory)\s+(sale|sell[- ]?off)s?\b/i
const GARAGE_RE = /\b(garage|yard|moving|car[- ]?boot|boot)\s+sales?\b/i
const COMMUNITY_RE = /\b(fete|fundraiser|fund[- ]raiser|swap|car[- ]?boot|school fair|working bee|street party)\b/i

export const matchesPopup = (text: string) => POPUP_RE.test(text)
export const matchesWarehouse = (text: string) => WAREHOUSE_RE.test(text)
export const matchesGarage = (text: string) => GARAGE_RE.test(text)
export const matchesCommunity = (text: string) => COMMUNITY_RE.test(text)
export const matchesMarketTitle = (title: string, subTags: string[]) =>
  MARKET_RE.test(title) || subTags.some((t) => /^markets?$/i.test(t))

export interface GuideEventFields {
  title: string
  description?: string | null
  category: string
  subTags?: string[] | null
  isFree: boolean
  isLGBTI: boolean
}

/** True when a listing belongs on a topic guide. Rows should already be passed through presentListing. */
export function matchesTopic(e: GuideEventFields, topic: TopicKey): boolean {
  const tags = e.subTags ?? []
  switch (topic) {
    case 'events':
    case 'tonight':
    case 'this-weekend':
      return true
    case 'free-events':
      return e.isFree
    case 'live-music':
      return e.category === 'Music' && !conflictsWithMusicIntent(e.title, e.description ?? '', tags)
    case 'family':
      return e.category === 'Family'
    case 'lgbtiq':
      return e.isLGBTI
    case 'festivals':
      return tags.includes('Festival') || /festival/i.test(e.title)
    case 'markets':
      return e.category !== 'Business' && matchesMarketTitle(e.title, tags)
    case 'pop-up-sales':
      return matchesPopup(e.title)
    case 'warehouse-sales':
      return matchesWarehouse(e.title)
    case 'garage-sales':
      return matchesGarage(e.title)
    case 'community-events':
      return matchesCommunity(e.title)
    default:
      return false
  }
}

export interface GuideSpec {
  activity: TopicKey | null
  when: WhenKey | null
  suburb: string | null
  suburbSlug: string | null
}

export type GuideKind =
  | 'city-topic'
  | 'city-when'
  | 'suburb'
  | 'city-activity-when'
  | 'suburb-activity'
  | 'suburb-when'
  | 'suburb-activity-when'

export type IndexReason = 'index' | 'empty' | 'thin' | 'stale' | 'near-duplicate'

export interface GuideDecision {
  spec: GuideSpec
  path: string
  kind: GuideKind
  total: number
  fresh: number
  index: boolean
  reason: IndexReason
  /** Indexable URL that should own this listing set. Equals path when this page is indexable. */
  canonicalPath: string
}

export interface InvRow {
  id: string
  dates: string[]
  time: string | null
  endTime: string | null
  suburb: string | null
  suburbSlug: string | null
  source: 'event' | 'local'
  topics: TopicKey[]
  organiserSubmitted: boolean
}

export interface KnownSuburb { name: string; slug: string; count: number }

export type ParsedCombo =
  | { kind: 'city-activity-when'; activity: TopicDef; when: WhenKey }
  | { kind: 'suburb-activity'; suburb: string; activity: TopicDef }
  | { kind: 'suburb-when'; suburb: string; when: WhenKey }
  | { kind: 'suburb-activity-when'; suburb: string; activity: TopicDef; when: WhenKey }

const specKey = (s: GuideSpec) => `${s.activity ?? ''}|${s.when ?? ''}|${s.suburbSlug ?? ''}`

export function guideKind(spec: GuideSpec): GuideKind {
  if (spec.suburbSlug && spec.activity && spec.when) return 'suburb-activity-when'
  if (spec.suburbSlug && spec.activity) return 'suburb-activity'
  if (spec.suburbSlug && spec.when) return 'suburb-when'
  if (spec.activity && spec.when) return 'city-activity-when'
  if (spec.suburbSlug) return 'suburb'
  if (spec.when) return 'city-when'
  return 'city-topic'
}

export function isComboKind(kind: GuideKind): boolean {
  return kind === 'city-activity-when' || kind === 'suburb-activity' || kind === 'suburb-when' || kind === 'suburb-activity-when'
}

export function topicSpec(topic: TopicKey): GuideSpec {
  if (topic === 'tonight' || topic === 'this-weekend') return { activity: null, when: topic, suburb: null, suburbSlug: null }
  if (topic === 'events') return { activity: null, when: null, suburb: null, suburbSlug: null }
  return { activity: topic, when: null, suburb: null, suburbSlug: null }
}

/** Public path for a guide, or null when that combination is not a page (city × weekday alone). */
export function guidePath(city: string | CityDef, spec: GuideSpec): string | null {
  const c = citySlug(city)
  if (spec.suburbSlug && spec.activity && spec.when) return `/${c}/${spec.suburbSlug}/${spec.activity}/${spec.when}`
  if (spec.suburbSlug && spec.activity) return `/${c}/${spec.suburbSlug}/${spec.activity}`
  if (spec.suburbSlug && spec.when) return `/${c}/${spec.suburbSlug}/${spec.when}`
  if (spec.suburbSlug) return `/${c}/${spec.suburbSlug}`
  if (spec.activity && spec.when) return `/${c}/${spec.activity}/${spec.when}`
  if (spec.activity) return `/${c}/${spec.activity}`
  if (spec.when === 'tonight' || spec.when === 'this-weekend') return `/${c}/${spec.when}`
  if (!spec.when && !spec.activity && !spec.suburbSlug) return `/${c}/events`
  return null
}

export function whenRange(city: CityDef, when: WhenKey, now = new Date()): { from: string; to: string } {
  if (when === 'tonight') {
    const today = cityToday(city, now)
    return { from: today, to: today }
  }
  if (when === 'this-weekend') return weekendRange(city, now)
  const today = cityToday(city, now)
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay()
  const target = when === 'friday' ? 5 : when === 'saturday' ? 6 : 0
  const delta = (target - dow + 7) % 7
  const day = addDaysKey(today, delta)
  return { from: day, to: day }
}

export function whenPhrase(when: WhenKey): string {
  switch (when) {
    case 'tonight': return 'tonight'
    case 'this-weekend': return 'this weekend'
    case 'friday': return 'on Friday'
    case 'saturday': return 'on Saturday'
    case 'sunday': return 'on Sunday'
  }
}

export function whenMenuLabel(when: WhenKey): string {
  switch (when) {
    case 'tonight': return 'Tonight'
    case 'this-weekend': return 'This weekend'
    case 'friday': return 'Friday'
    case 'saturday': return 'Saturday'
    case 'sunday': return 'Sunday'
  }
}

const NOUN: Partial<Record<TopicKey, string>> = {
  'free-events': 'free events',
  'live-music': 'live music listings',
  markets: 'markets',
  festivals: 'festivals',
  family: 'family events',
  lgbtiq: 'LGBTIQ+ events',
  'garage-sales': 'garage sales',
  'warehouse-sales': 'warehouse sales',
  'pop-up-sales': 'pop-up sales',
  'community-events': 'community events',
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)

export function formatGuideDay(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

export function formatGuideSpan(from: string, to: string | null): string {
  const short = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  if (!to || to === from) return short(from)
  return `${short(from)}–${short(to)}`
}

export function guideCopy(input: {
  city: string
  activity: TopicDef | null
  when: WhenKey | null
  suburb: string | null
  total: number
  from?: string | null
  to?: string | null
  venues?: string[]
}): { h1: string; title: string; description: string } {
  const place = input.suburb ? `${input.suburb}, ${input.city}` : input.city
  const phrase = input.when ? whenPhrase(input.when) : null
  const label = input.activity?.label ?? 'Things to do'
  let h1: string
  if (input.activity && input.suburb && phrase) h1 = `${label} in ${place} ${phrase}`
  else if (input.activity && input.suburb) h1 = `${label} in ${place}`
  else if (input.activity && phrase) h1 = `${label} in ${input.city} ${phrase}`
  else if (input.suburb && input.when === 'tonight') h1 = `What’s on in ${place} tonight`
  else if (input.suburb && phrase) h1 = `Things to do in ${place} ${phrase}`
  else h1 = input.activity ? input.activity.heading(input.city) : `Events in ${place}`
  const span = input.when && input.from ? formatGuideSpan(input.from, input.to ?? null) : ''
  const noun = (input.activity && NOUN[input.activity.key]) || 'events'
  const venues = (input.venues ?? []).map((v) => v.trim()).filter((v) => {
    const n = v.toLowerCase()
    return n && n !== 'tba' && n !== input.city.toLowerCase() && n !== input.suburb?.toLowerCase()
  }).slice(0, 2)
  const whereBit = phrase ? ` ${phrase}` : ''
  const countBit = input.total > 0 ? `${input.total} upcoming ${noun}` : `Upcoming ${noun}`
  const venueBit = venues.length ? ` On this page: ${list(venues)}.` : ''
  return {
    h1,
    title: `${h1}${span ? ` (${span})` : ''} | VibePeep`,
    description: `${countBit} in ${place}${whereBit}.${venueBit} Listings are the current VibePeep inventory, with times and prices from the organiser.`,
  }
}

export function comboFacts(input: {
  city: string
  suburb?: string | null
  activity: TopicDef | null
  when: WhenKey | null
  total: number
  from?: string | null
  to?: string | null
  next?: { title: string; venue?: string | null; when?: string | null } | null
}): { question: string; answer: string }[] {
  const place = input.suburb ? `${input.suburb}, ${input.city}` : input.city
  const noun = (input.activity && NOUN[input.activity.key]) || 'events'
  const phrase = input.when ? whenPhrase(input.when) : null
  const span = input.when && input.from ? formatGuideSpan(input.from, input.to ?? null) : null
  const count = input.total > 0
    ? `VibePeep currently lists ${input.total} upcoming ${input.total === 1 ? 'listing' : 'listings'} for this page.`
    : 'New listings are added as organisers and ticket sites publish them.'
  const whenBit = span ? ` The date on this page is ${span}.` : ''
  const out = [{
    question: input.activity?.key === 'garage-sales'
      ? `Where are garage sales near ${place}?`
      : phrase
        ? `What ${noun} are on ${phrase} in ${place}?`
        : `What ${noun} are on in ${place}?`,
    answer: input.activity?.key === 'garage-sales'
      ? `These are public garage, moving and car boot sales in ${place}.${whenBit} ${count} A separate near-me page is not published, because it would repeat this list.`
      : `This page is only ${noun} in ${place}${phrase ? ` ${phrase}` : ''}.${whenBit} ${count}`,
  }]
  if (input.next?.title) {
    const bits = [input.next.when, input.next.venue].filter(Boolean).join(' at ')
    out.push({
      question: `What’s the next listing in ${place}?`,
      answer: `${input.next.title}${bits ? ` — ${bits}` : ''}. Times and prices can change, so confirm with the organiser before you go.`,
    })
  }
  return out
}

export function parseCombo(city: CityDef, segments: string[], suburbs: { name: string; slug: string }[]): ParsedCombo | null {
  if (segments.length < 2 || segments.length > 3) return null
  let parts: string[]
  try {
    parts = segments.map((s) => decodeURIComponent(s).trim().toLowerCase())
  } catch {
    return null
  }
  if (parts.some((p) => !p || p.includes('.') || p.includes('/'))) return null
  const [a, b, c] = parts
  const activity = (key: string) => ACTIVITY_TOPICS.find((t) => t.key === key) ?? null
  const when = (key: string): WhenKey | null => ((WHEN_KEYS as readonly string[]).includes(key) ? key as WhenKey : null)
  const suburb = suburbs.find((s) => s.slug === a)
  if (suburb && isLandingSuburb(suburb.name, city)) {
    const act = activity(b!)
    if (c) {
      const day = when(c)
      if (!act || !day) return null
      return { kind: 'suburb-activity-when', suburb: suburb.name, activity: act, when: day }
    }
    if (act) return { kind: 'suburb-activity', suburb: suburb.name, activity: act }
    const day = when(b!)
    if (day) return { kind: 'suburb-when', suburb: suburb.name, when: day }
    return null
  }
  const act = activity(a!)
  const day = when(b!)
  if (act && day && !c) return { kind: 'city-activity-when', activity: act, when: day }
  return null
}

export function specFromParsed(parsed: ParsedCombo): GuideSpec {
  switch (parsed.kind) {
    case 'city-activity-when':
      return { activity: parsed.activity.key, when: parsed.when, suburb: null, suburbSlug: null }
    case 'suburb-activity':
      return { activity: parsed.activity.key, when: null, suburb: parsed.suburb, suburbSlug: slugify(parsed.suburb) }
    case 'suburb-when':
      return { activity: null, when: parsed.when, suburb: parsed.suburb, suburbSlug: slugify(parsed.suburb) }
    case 'suburb-activity-when':
      return { activity: parsed.activity.key, when: parsed.when, suburb: parsed.suburb, suburbSlug: slugify(parsed.suburb) }
  }
}

interface EvalCtx {
  city: CityDef
  today: string
  freshUntil: string
  windows: Map<WhenKey, { from: string; to: string }>
}

function rowMatches(row: InvRow, spec: GuideSpec, ctx: EvalCtx): boolean {
  if (spec.suburbSlug && row.suburbSlug !== spec.suburbSlug) return false
  if (row.source === 'local') {
    if (spec.activity) {
      if (!row.topics.includes(spec.activity)) return false
    } else if (!row.organiserSubmitted || (!spec.when && !spec.suburbSlug)) return false
  } else if (spec.activity && !row.topics.includes(spec.activity)) return false
  if (spec.when) {
    const w = ctx.windows.get(spec.when)
    if (!w || !row.dates.some((d) => d >= w.from && d <= w.to)) return false
    if (spec.when === 'tonight' && !isTonightSlot(row.time, row.endTime)) return false
  }
  return true
}

function rowIsFresh(row: InvRow, spec: GuideSpec, ctx: EvalCtx): boolean {
  if (spec.when) return true
  return row.dates.some((d) => d >= ctx.today && d <= ctx.freshUntil)
}

function parentSpecs(spec: GuideSpec, ctx: EvalCtx): GuideSpec[] {
  const out: GuideSpec[] = []
  const push = (s: GuideSpec) => {
    if (specKey(s) === specKey(spec)) return
    if (!guidePath(ctx.city, s)) return
    if (!out.some((x) => specKey(x) === specKey(s))) out.push(s)
  }
  if (spec.when) push({ ...spec, when: null })
  if (spec.activity) push({ ...spec, activity: null })
  if (spec.suburbSlug) push({ ...spec, suburb: null, suburbSlug: null })
  if (spec.when === 'friday' || spec.when === 'saturday' || spec.when === 'sunday') {
    const day = ctx.windows.get(spec.when)
    const weekend = ctx.windows.get('this-weekend')
    if (day && weekend && day.from >= weekend.from && day.to <= weekend.to) {
      push({ ...spec, when: 'this-weekend' })
    }
  }
  return out
}

function usualName(names: Map<string, number> | undefined): string | null {
  if (!names?.size) return null
  return [...names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0]
}

export function suburbDirectory(city: CityDef, rows: InvRow[]): KnownSuburb[] {
  const totals = new Map<string, number>()
  const eventNames = new Map<string, Map<string, number>>()
  const localNames = new Map<string, Map<string, number>>()
  for (const row of rows) {
    if (!row.suburb || !row.suburbSlug || !isLandingSuburb(row.suburb, city)) continue
    totals.set(row.suburbSlug, (totals.get(row.suburbSlug) ?? 0) + 1)
    const bucket = row.source === 'event' ? eventNames : localNames
    const names = bucket.get(row.suburbSlug) ?? new Map<string, number>()
    names.set(row.suburb, (names.get(row.suburb) ?? 0) + 1)
    bucket.set(row.suburbSlug, names)
  }
  return [...totals.entries()]
    .map(([slug, count]) => ({ name: usualName(eventNames.get(slug)) ?? usualName(localNames.get(slug)) ?? slug, slug, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/**
 * Every guide with at least one matching listing, and whether it may be indexed.
 * Primary city and suburb guides are indexed at MIN_INDEX. Combinations also have
 * to be fresh (when undated) and distinct from the broader page a visitor would already see.
 */
export function evaluateGuides(city: CityDef, rows: InvRow[], now = new Date()): GuideDecision[] {
  const today = cityToday(city, now)
  const ctx: EvalCtx = {
    city,
    today,
    freshUntil: addDaysKey(today, FRESH_DAYS),
    windows: new Map(WHEN_KEYS.map((key) => [key, whenRange(city, key, now)])),
  }
  const tallies = new Map<string, { total: number; fresh: number }>()
  const tally = (spec: GuideSpec) => {
    const key = specKey(spec)
    const hit = tallies.get(key)
    if (hit) return hit
    let total = 0
    let fresh = 0
    for (const row of rows) {
      if (!rowMatches(row, spec, ctx)) continue
      total++
      if (rowIsFresh(row, spec, ctx)) fresh++
    }
    const result = { total, fresh }
    tallies.set(key, result)
    return result
  }

  const memo = new Map<string, GuideDecision>()
  const visiting = new Set<string>()
  const decide = (spec: GuideSpec): GuideDecision | null => {
    const path = guidePath(city, spec)
    if (!path) return null
    const key = specKey(spec)
    const cached = memo.get(key)
    if (cached) return cached
    if (visiting.has(key)) return null
    visiting.add(key)
    const { total, fresh } = tally(spec)
    const kind = guideKind(spec)
    const base = { spec, path, kind, total, fresh, canonicalPath: path }
    let decision: GuideDecision
    if (total <= 0) decision = { ...base, index: false, reason: 'empty' }
    else if (!isComboKind(kind)) decision = { ...base, index: total >= MIN_INDEX, reason: total >= MIN_INDEX ? 'index' : 'thin' }
    else if (total < MIN_INDEX) decision = { ...base, index: false, reason: 'thin' }
    else if (kind === 'suburb-activity' && fresh < MIN_FRESH) decision = { ...base, index: false, reason: 'stale' }
    else {
      const dups = parentSpecs(spec, ctx)
        .map((parent) => ({ spec: parent, total: tally(parent).total, path: guidePath(city, parent)! }))
        .filter((parent) => parent.total >= total && total / parent.total >= NEAR_DUP_RATIO)
        .sort((a, b) => a.total - b.total || a.path.length - b.path.length || a.path.localeCompare(b.path))
      let canonical: string | null = null
      for (const dup of dups) {
        const parent = decide(dup.spec)
        const target = parent?.index ? parent.path : parent?.reason === 'near-duplicate' ? parent.canonicalPath : null
        if (target && target !== path) { canonical = target; break }
      }
      decision = canonical
        ? { ...base, index: false, reason: 'near-duplicate', canonicalPath: canonical }
        : { ...base, index: true, reason: 'index' }
    }
    visiting.delete(key)
    memo.set(key, decision)
    return decision
  }

  const suburbs = suburbDirectory(city, rows)
  const specs: GuideSpec[] = TOPICS.map((t) => topicSpec(t.key))
  for (const suburb of suburbs) specs.push({ activity: null, when: null, suburb: suburb.name, suburbSlug: suburb.slug })
  for (const activity of ACTIVITY_TOPICS) {
    for (const when of WHEN_KEYS) specs.push({ activity: activity.key, when, suburb: null, suburbSlug: null })
  }
  for (const suburb of suburbs) {
    for (const activity of ACTIVITY_TOPICS) {
      specs.push({ activity: activity.key, when: null, suburb: suburb.name, suburbSlug: suburb.slug })
      for (const when of WHEN_KEYS) specs.push({ activity: activity.key, when, suburb: suburb.name, suburbSlug: suburb.slug })
    }
    for (const when of WHEN_KEYS) specs.push({ activity: null, when, suburb: suburb.name, suburbSlug: suburb.slug })
  }

  const seen = new Set<string>()
  const out: GuideDecision[] = []
  for (const spec of specs) {
    const decision = decide(spec)
    if (!decision || decision.reason === 'empty' || seen.has(decision.path)) continue
    seen.add(decision.path)
    out.push(decision)
  }
  return out
}

export function relatedGuides(decisions: GuideDecision[], currentPath: string, cityName: string): { href: string; title: string }[] {
  const current = decisions.find((d) => d.path === currentPath)
  if (!current) return []
  const indexed = decisions.filter((d) => d.index && d.path !== currentPath)
  const pick = (pred: (s: GuideSpec) => boolean, limit: number) =>
    indexed.filter((d) => pred(d.spec)).sort((a, b) => b.total - a.total || a.path.localeCompare(b.path)).slice(0, limit)
  const c = current.spec
  const noWhen = (s: GuideSpec) => !s.when
  const noSuburb = (s: GuideSpec) => !s.suburbSlug
  const noActivity = (s: GuideSpec) => !s.activity
  let chosen: GuideDecision[] = []
  if (!c.suburbSlug && c.activity && !c.when) {
    chosen = [
      ...pick((s) => s.activity === c.activity && !!s.when && noSuburb(s), 5),
      ...pick((s) => s.activity === c.activity && !!s.suburbSlug && noWhen(s), 8),
    ]
  } else if (!c.suburbSlug && !c.activity && c.when) {
    chosen = pick((s) => s.when === c.when && !!s.activity && noSuburb(s), 10)
  } else if (c.suburbSlug && !c.activity && !c.when) {
    chosen = [
      ...pick((s) => s.suburbSlug === c.suburbSlug && !!s.activity && noWhen(s), 8),
      ...pick((s) => s.suburbSlug === c.suburbSlug && !!s.when && noActivity(s), 5),
    ]
  } else if (!c.suburbSlug && c.activity && c.when) {
    chosen = [
      ...pick((s) => s.activity === c.activity && s.when === c.when && !!s.suburbSlug, 8),
      ...pick((s) => s.activity === c.activity && !!s.when && s.when !== c.when && noSuburb(s), 4),
    ]
  } else if (c.suburbSlug && c.activity && !c.when) {
    chosen = [
      ...pick((s) => s.suburbSlug === c.suburbSlug && s.activity === c.activity && !!s.when, 5),
      ...pick((s) => s.suburbSlug === c.suburbSlug && !!s.activity && s.activity !== c.activity && noWhen(s), 6),
    ]
  } else if (c.suburbSlug && !c.activity && c.when) {
    chosen = [
      ...pick((s) => s.suburbSlug === c.suburbSlug && s.when === c.when && !!s.activity, 8),
      ...pick((s) => s.suburbSlug === c.suburbSlug && !!s.when && s.when !== c.when && noActivity(s), 4),
    ]
  } else if (c.suburbSlug && c.activity && c.when) {
    chosen = [
      ...pick((s) => s.suburbSlug === c.suburbSlug && s.activity === c.activity && !!s.when && s.when !== c.when, 4),
      ...pick((s) => s.suburbSlug === c.suburbSlug && s.when === c.when && !!s.activity && s.activity !== c.activity, 6),
    ]
  }
  const seen = new Set<string>()
  const links: { href: string; title: string }[] = []
  for (const d of chosen) {
    if (seen.has(d.path)) continue
    seen.add(d.path)
    links.push({
      href: d.path,
      title: guideCopy({
        city: cityName,
        activity: d.spec.activity ? topicDef(d.spec.activity) ?? null : null,
        when: d.spec.when,
        suburb: d.spec.suburb,
        total: d.total,
      }).h1,
    })
    if (links.length >= 12) break
  }
  return links
}
