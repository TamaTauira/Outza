import { CATEGORIES, areasForCity } from '@/lib/categories'
import { CITIES, CITY_NAMES } from '@/lib/cities'

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const MAX_DAYS = 60
const EXPLICIT_HORIZON_DAYS = 366 * 10
const CAT_NAMES = CATEGORIES.map((c) => c.name)
const TIMES = ['morning', 'afternoon', 'evening', 'any'] as const
type TimeOfDay = (typeof TIMES)[number]

export interface AiFilters {
  dateFrom: string
  dateTo: string
  category: string
  isFree: boolean
  maxPrice: number | null
  lgbtiq: boolean
  timeOfDay: TimeOfDay
  suburb: string
  subTag: string
  /** True when the person asked for paid events, so free listings stay out. */
  paidOnly: boolean
  keywords: string[]
  soon: boolean
  /** City named in the query. Empty when the query did not name one (the page city still applies). */
  city: string
  /** "near me" / "nearby" — needs the browser's location, not the board city. */
  nearMe: boolean
  /** True only when the person picked a category (the vibe control). Inferred topics stay soft. */
  categoryStrict: boolean
}

const GENERIC = new Set(['live', 'music', 'live music', 'event', 'events', 'things', 'fun', 'stuff', 'show', 'shows', 'activities'])
const SOFT = new Set(['upcoming', 'coming', 'soon', 'later', 'future', 'year', 'years'])
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const clean = (s: unknown, n = 40) => (typeof s === 'string' ? s.replace(/[^\p{L}\p{N} '&-]/gu, '').trim().slice(0, n) : '')

const MONTH_FULL: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
}
const MONTH_ABBR: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12, may: 5,
}
const MONTH_TOKEN = [...Object.keys(MONTH_FULL), ...Object.keys(MONTH_ABBR), 'may'].sort((a, b) => b.length - a.length).join('|')

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}
function monthNum(name: string): number | null {
  const k = name.toLowerCase()
  return MONTH_FULL[k] ?? MONTH_ABBR[k] ?? null
}
function validDay(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null
  return ymd(y, m, d)
}
function monthBounds(y: number, m: number): { from: string; to: string } | null {
  if (m < 1 || m > 12 || y < 2000 || y > 2100) return null
  return { from: ymd(y, m, 1), to: ymd(y, m, daysInMonth(y, m)) }
}

interface Span { from: string; to: string; start: number; end: number; kind: 'when' | 'year' | 'open'; month?: number }

function overlaps(spans: Span[], start: number, end: number) {
  return spans.some((s) => start < s.end && end > s.start)
}

/** Next occurrence of a month when the query did not name a year. */
function inferYear(month: number, today: string, hinted: number | null): number {
  if (hinted) return hinted
  const y = Number(today.slice(0, 4))
  const m = Number(today.slice(5, 7))
  const dim = daysInMonth(y, month)
  if (month < m || (month === m && dim < Number(today.slice(8, 10)))) return y + 1
  return y
}

/**
 * Explicit calendar language: a year, a month, or a date. Relative words
 * ("upcoming", "tonight") are not explicit and must not replace these.
 */
export function extractExplicitRange(q: string, today: string): { from: string; to: string } | null {
  const spans: Span[] = []
  const take = (re: RegExp, build: (m: RegExpExecArray) => { from: string; to: string; kind?: Span['kind']; month?: number } | null) => {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(q))) {
      const start = m.index
      const end = start + m[0].length
      if (overlaps(spans, start, end)) continue
      const built = build(m)
      if (!built) continue
      spans.push({ from: built.from, to: built.to, start, end, kind: built.kind ?? 'when', month: built.month })
    }
  }

  const monthYear = (monthName: string, year: string, day?: string, endDay?: string) => {
    const month = monthNum(monthName)
    const y = Number(year)
    if (!month) return null
    if (day) {
      const from = validDay(y, month, Number(day))
      const to = validDay(y, month, Number(endDay ?? day))
      if (!from || !to) return null
      return { from: from <= to ? from : to, to: from <= to ? to : from }
    }
    const bounds = monthBounds(y, month)
    return bounds ? { ...bounds } : null
  }

  // "3-10 January 2027" / "3 to 10 January 2027"
  take(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|–|—|\\bto\\b)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_TOKEN})\\s+(20\\d{2})\\b`, 'gi'), (m) => monthYear(m[3], m[4], m[1], m[2]))
  take(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_TOKEN})\\s+(20\\d{2})\\b`, 'gi'), (m) => monthYear(m[2], m[3], m[1]))
  take(new RegExp(`\\b(${MONTH_TOKEN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,)?\\s+(20\\d{2})\\b`, 'gi'), (m) => monthYear(m[1], m[3], m[2]))
  take(new RegExp(`\\b(${MONTH_TOKEN})\\s+(20\\d{2})\\b`, 'gi'), (m) => monthYear(m[1], m[2]))
  take(/\b(20\d{2})-(\d{2})-(\d{2})\b/g, (m) => {
    const day = validDay(Number(m[1]), Number(m[2]), Number(m[3]))
    return day ? { from: day, to: day } : null
  })
  take(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/g, (m) => {
    const day = validDay(Number(m[3]), Number(m[2]), Number(m[1]))
    return day ? { from: day, to: day } : null
  })
  // "7 Nov" / "14 November" is that day, not the whole month. Year is inferred.
  take(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_TOKEN})\\b(?!\\s*,?\\s*20\\d{2})`, 'gi'), (m) => {
    const month = monthNum(m[2])
    if (!month) return null
    const day = validDay(inferYear(month, today, null), month, Number(m[1]))
    return day ? { from: day, to: day } : null
  })
  take(new RegExp(`\\b(${MONTH_TOKEN})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s*,?\\s*20\\d{2})`, 'gi'), (m) => {
    const month = monthNum(m[1])
    if (!month) return null
    const day = validDay(inferYear(month, today, null), month, Number(m[2]))
    return day ? { from: day, to: day } : null
  })
  // Month without a year glued to it ("in January", "January" in "January in 2027").
  take(new RegExp(`\\b(?:in|this|next|during)\\s+(${MONTH_TOKEN})\\b(?!\\s+\\d)`, 'gi'), (m) => {
    const month = monthNum(m[1])
    return month ? { from: '', to: '', kind: 'open', month } : null
  })
  take(new RegExp(`\\b(${Object.keys(MONTH_FULL).join('|')})\\b(?!\\s+\\d)`, 'gi'), (m) => {
    const month = monthNum(m[1])
    return month ? { from: '', to: '', kind: 'open', month } : null
  })
  take(/(?<!\$)\b(20\d{2})\b/g, (m) => ({ from: `${m[1]}-01-01`, to: `${m[1]}-12-31`, kind: 'year' }))

  const yearsInQuery = [...q.matchAll(/(?<!\$)\b(20\d{2})\b/g)].map((m) => Number(m[1]))
  const distinctYears = [...new Set(yearsInQuery)]
  const hint = distinctYears.length === 1 ? distinctYears[0] : null

  const resolved: { from: string; to: string }[] = []
  for (const s of spans) {
    if (s.kind === 'year') continue
    if (s.kind === 'open' && s.month) {
      const bounds = monthBounds(inferYear(s.month, today, hint), s.month)
      if (bounds) resolved.push(bounds)
      continue
    }
    if (s.from && s.to) resolved.push({ from: s.from, to: s.to })
  }

  if (!resolved.length && distinctYears.length === 1) return { from: `${distinctYears[0]}-01-01`, to: `${distinctYears[0]}-12-31` }
  if (!resolved.length && distinctYears.length >= 2) {
    const sorted = [...distinctYears].sort((a, b) => a - b)
    return { from: `${sorted[0]}-01-01`, to: `${sorted[sorted.length - 1]}-12-31` }
  }
  if (!resolved.length && /\bnext year\b/i.test(q)) {
    const y = Number(today.slice(0, 4)) + 1
    return { from: `${y}-01-01`, to: `${y}-12-31` }
  }
  if (!resolved.length && /\bthis year\b/i.test(q)) {
    const y = Number(today.slice(0, 4))
    return { from: `${y}-01-01`, to: `${y}-12-31` }
  }
  if (!resolved.length) return null
  const from = resolved.map((s) => s.from).sort()[0]
  const to = resolved.map((s) => s.to).sort().at(-1) as string
  return { from, to }
}

export function cityInQuery(q: string): string {
  const cities = [...CITIES].sort((a, b) => b.name.length - a.name.length)
  for (const c of cities) {
    const name = c.name.toLowerCase().replace(/ /g, '\\s+')
    if (new RegExp(`(^|[^a-z])${name}([^a-z]|$)`, 'i').test(q)) return c.name
  }
  return ''
}

function weekend(today: string): [string, string] {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay()
  if (dow === 0) return [today, today]
  if (dow === 6) return [today, addDays(today, 1)]
  return [addDays(today, 6 - dow), addDays(today, 7 - dow)]
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')
}

/** Longest known suburb in the query. A name that belongs to one city also names that city. */
function suburbHit(q: string): { suburb: string; city: string } | null {
  const hits: { suburb: string; city: string }[] = []
  for (const c of CITY_NAMES) {
    for (const area of areasForCity(c)) {
      if (/^cbd$/i.test(area)) continue
      if (new RegExp(`\\b${escapeRe(area)}\\b(?!\\s+(?:st|street|rd|road|ave|avenue|ln|lane|dr|drive)\\b)`, 'i').test(q)) hits.push({ suburb: area, city: c })
    }
  }
  if (!hits.length) return null
  hits.sort((a, b) => b.suburb.length - a.suburb.length)
  const top = hits[0]
  const same = hits.filter((h) => h.suburb.toLowerCase() === top.suburb.toLowerCase())
  const cities = new Set(same.map((h) => h.city))
  return { suburb: top.suburb, city: cities.size === 1 ? top.city : '' }
}

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
const DATE_WORDS = new Set([
  'next', 'week', 'weeks', 'month', 'night', 'nights', 'christmas', 'xmas', 'saturday', 'sunday',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'tonight', 'today', 'tomorrow', 'weekend',
])

/** Common misspellings and names for the same thing, applied before the rules run. */
export function correctQueryTypos(q: string): string {
  return q
    .replace(/\bmarkts\b/gi, 'markets')
    .replace(/\bcomdey\b/gi, 'comedy')
    .replace(/\bjaz\b/gi, 'jazz')
    .replace(/\bbazaars?\b/gi, 'market')
    .replace(/\bmakers\s+markets?\b/gi, 'markets')
}

function stemKeyword(w: string): string {
  if (w === 'markets' || w === 'markts') return 'market'
  if (w === 'comedian' || w === 'comedians' || w === 'comdey') return 'comedy'
  if (w === 'exhibitions') return 'exhibition'
  if (w === 'theatres' || w === 'theaters' || w === 'theater') return 'theatre'
  if (w === 'festivals') return 'festival'
  return w
}

function nextWeekday(today: string, target: number): string {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay()
  const delta = (target - dow + 7) % 7
  return addDays(today, delta)
}

function categoryFromQuery(s: string): { category: string; subTag: string } {
  if (/\b(films?|cinema|screenings?|documentary|documentaries)\b/.test(s)) return { category: 'Arts & Culture', subTag: 'Film' }
  if (/\bworkshops?\b/.test(s)) return { category: 'Business', subTag: 'Workshop' }
  if (/\b(exhibitions?|gallery|galleries)\b/.test(s)) return { category: 'Arts & Culture', subTag: 'Exhibition' }
  if (/\b(comedy|comedian)\b/.test(s)) return { category: 'Arts & Culture', subTag: 'Comedy' }
  let best: { category: string; tag: string; len: number } | null = null
  for (const cat of CATEGORIES) {
    const head = cat.name.toLowerCase()
    if (s.includes(head) && (!best || head.length > best.len)) best = { category: cat.name, tag: '', len: head.length }
    for (const tag of cat.subTags) {
      const t = tag.toLowerCase()
      if (/^markets?$/.test(t) || t === 'festival' || t === 'party' || t === 'cultural') continue
      if (s.includes(t) && (!best || t.length > best.len)) best = { category: cat.name, tag, len: t.length }
    }
  }
  if (/\b(gig|band|concert|live music)\b/.test(s)) return { category: 'Music', subTag: best?.tag && best.category === 'Music' ? best.tag : '' }
  return best ? { category: best.category, subTag: best.tag } : { category: '', subTag: '' }
}

export function fallbackParse(q: string, today: string) {
  q = correctQueryTypos(q)
  const s = q.toLowerCase()
  const out: Record<string, unknown> = { keywords: [] as string[], explicitDates: false, city: '', subTag: '', paidOnly: false, categoryStrict: false }
  const range = extractExplicitRange(q, today)
  const weekday = s.match(/\b(?:on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+night)?\b/)
  if (range) {
    out.dateFrom = range.from
    out.dateTo = range.to
    out.explicitDates = true
  } else if (/\b(christmas|xmas)\b/.test(s)) {
    const y = Number(today.slice(0, 4))
    const thisYear = `${y}-12-25`
    out.dateFrom = out.dateTo = thisYear >= today ? thisYear : `${y + 1}-12-25`
    out.explicitDates = true
  } else if (/\b(nye|new year'?s eve)\b/.test(s)) {
    const y = Number(today.slice(0, 4))
    const thisYear = `${y}-12-31`
    const year = thisYear >= today ? y : y + 1
    out.dateFrom = out.dateTo = `${year}-12-31`
    out.explicitDates = true
  } else if (/\btonight\b/.test(s)) {
    out.dateFrom = out.dateTo = today
    out.timeOfDay = 'evening'
  } else if (/\btoday\b/.test(s)) out.dateFrom = out.dateTo = today
  else if (/\btomorrow\b/.test(s)) out.dateFrom = out.dateTo = addDays(today, 1)
  else if (/\bnext\s+weekend\b/.test(s)) {
    const [from, to] = weekend(today)
    out.dateFrom = addDays(from, 7)
    out.dateTo = addDays(to, 7)
    out.explicitDates = true
  } else if (/\bnext\s+week\b/.test(s)) {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay()
    const toMonday = ((8 - dow) % 7) || 7
    out.dateFrom = addDays(today, toMonday)
    out.dateTo = addDays(String(out.dateFrom), 6)
    out.explicitDates = true
  } else if (/\bthis\s+month\b/.test(s)) {
    const bounds = monthBounds(Number(today.slice(0, 4)), Number(today.slice(5, 7)))
    if (bounds) { out.dateFrom = bounds.from; out.dateTo = bounds.to; out.explicitDates = true }
  } else if (weekday) {
    const target = WEEKDAY_NAMES.indexOf(weekday[1] as (typeof WEEKDAY_NAMES)[number])
    out.dateFrom = out.dateTo = nextWeekday(today, target)
    if (/\bnight\b/.test(weekday[0])) out.timeOfDay = 'evening'
    out.explicitDates = true
  } else if (/\bweekend\b/.test(s)) [out.dateFrom, out.dateTo] = weekend(today)
  if (/\bfree\b/.test(s)) out.isFree = true
  else if (/\bpaid\b/.test(s)) out.paidOnly = true
  if (/\b(lgbt|queer|gay|pride)/.test(s)) out.lgbtiq = true
  const money = s.match(/(?:under|below|less than)\s*\$?(\d+)/)
  if (money) out.maxPrice = Number(money[1])
  const cat = categoryFromQuery(s)
  if (cat.category) out.category = cat.category
  if (cat.subTag) out.subTag = cat.subTag
  const namedCity = cityInQuery(q)
  const place = suburbHit(q)
  if (namedCity) out.city = namedCity
  else if (place?.city) out.city = place.city
  if (place?.suburb) out.suburb = place.suburb
  const city = String(out.city || '')
  const stop = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'what', 'whats', 'events', 'event', 'near', 'free', 'paid', 'under', 'something', 'things', 'thing', 'some', 'show', 'find', 'me', 'on', 'in', 'to', 'do', 'a', 'an', 'of', 'at', 'live', 'music', 'nye', 'new', 'year', 'eve', 'bar', ...DATE_WORDS, ...SOFT, ...Object.keys(MONTH_FULL), ...Object.keys(MONTH_ABBR), 'may'])
  if (city) city.toLowerCase().split(/\s+/).forEach((w) => stop.add(w))
  if (place?.suburb) place.suburb.toLowerCase().split(/\s+/).forEach((w) => stop.add(w))
  const words = s.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !stop.has(w) && !/^\d+$/.test(w)).map(stemKeyword)
  out.keywords = [...new Set(words)].slice(0, 4)
  return out
}

function cityFromText(value: unknown): string {
  const text = clean(value, 40).toLowerCase()
  return CITIES.find((c) => c.name.toLowerCase() === text)?.name ?? ''
}

/** Validates model or fallback output. Explicit years are not pulled back to the default two-week window. */
export function normalise(raw: any, today: string, explicitDates = false): AiFilters {
  const cap = addDays(today, explicitDates ? EXPLICIT_HORIZON_DAYS : MAX_DAYS)
  let from = DAY_RE.test(raw?.dateFrom) ? raw.dateFrom : today
  let to = DAY_RE.test(raw?.dateTo) ? raw.dateTo : addDays(from, 13)
  if (explicitDates && DAY_RE.test(raw?.dateFrom) && DAY_RE.test(raw?.dateTo)) {
    from = raw.dateFrom
    to = raw.dateTo < from ? from : raw.dateTo
    if (to >= today && from < today) from = today
    if (to > cap) to = cap
    if (from > to) from = to
  } else {
    if (from < today) from = today
    if (to < from) to = from
    if (to > cap) to = cap
  }
  let city = CITY_NAMES.includes(raw?.city) ? raw.city : cityFromText(raw?.city)
  let suburb = clean(raw?.suburb)
  const suburbCity = cityFromText(suburb)
  if (!city && suburbCity) { city = suburbCity; suburb = '' }
  const cityWords = new Set(city.toLowerCase().split(/\s+/).filter(Boolean))
  const keywords = (Array.isArray(raw?.keywords) ? raw.keywords : [])
    .map((k: unknown) => clean(k, 30))
    .filter((k: string) => {
      const l = k.toLowerCase()
      if (k.length <= 1 || GENERIC.has(l) || SOFT.has(l) || cityWords.has(l)) return false
      if (/^20\d{2}$/.test(l) || MONTH_FULL[l] || MONTH_ABBR[l] || l === 'may' || DATE_WORDS.has(l)) return false
      return true
    })
    .slice(0, 4)
  const maxPrice = Number(raw?.maxPrice)
  return {
    dateFrom: from, dateTo: to,
    category: CAT_NAMES.includes(raw?.category) ? raw.category : '',
    isFree: raw?.isFree === true,
    maxPrice: Number.isFinite(maxPrice) && maxPrice > 0 ? Math.min(maxPrice, 2000) : null,
    lgbtiq: raw?.lgbtiq === true,
    timeOfDay: TIMES.includes(raw?.timeOfDay) ? raw.timeOfDay : 'any',
    suburb,
    subTag: typeof raw?.subTag === 'string' ? raw.subTag : '',
    paidOnly: raw?.paidOnly === true,
    keywords,
    soon: false,
    city,
    nearMe: false,
    categoryStrict: raw?.categoryStrict === true,
  }
}

function queryNamesYear(q: string, date: unknown): boolean {
  return typeof date === 'string' && DAY_RE.test(date) && new RegExp(`\\b${date.slice(0, 4)}\\b`).test(q)
}

/** Fallback parse, with an optional model JSON merged in. Explicit dates in the query win. */
export function interpretQuery(q: string, today: string, aiRaw?: any): AiFilters {
  const fb = fallbackParse(q, today)
  const ai = aiRaw && typeof aiRaw === 'object' ? aiRaw : null
  const aiNamesYear = !!ai && (queryNamesYear(q, ai.dateFrom) || queryNamesYear(q, ai.dateTo))
  let merged: any
  if (fb.explicitDates) {
    merged = {
      ...(ai ?? {}),
      ...fb,
      category: ai?.category || fb.category,
      keywords: fb.keywords,
      isFree: ai?.isFree === true || fb.isFree === true,
      lgbtiq: ai?.lgbtiq === true || fb.lgbtiq === true,
      maxPrice: ai?.maxPrice ?? fb.maxPrice ?? null,
      timeOfDay: fb.timeOfDay || ai?.timeOfDay,
      suburb: fb.suburb || ai?.suburb || '',
      city: fb.city || ai?.city || '',
      dateFrom: fb.dateFrom,
      dateTo: fb.dateTo,
    }
  } else if (ai && fb.dateFrom && !/\bnext\b/i.test(q)) {
    merged = { ...ai, ...(!ai.category && fb.category ? { category: fb.category } : {}), dateFrom: fb.dateFrom, dateTo: fb.dateTo, timeOfDay: fb.timeOfDay ?? ai.timeOfDay, city: fb.city || ai.city }
  } else if (ai && aiNamesYear) {
    merged = { ...ai, city: fb.city || ai.city, category: ai.category || fb.category }
  } else {
    merged = ai ? { ...fb, ...ai, city: fb.city || ai.city, category: ai.category || fb.category, timeOfDay: fb.timeOfDay || ai.timeOfDay } : fb
  }
  if (/\b(live music|gigs?|concerts?)\b/i.test(q)) merged = { ...merged, category: 'Music' }
  const out = normalise(merged, today, Boolean(fb.explicitDates) || (aiNamesYear && !fb.dateFrom))
  if (typeof fb.suburb === 'string' && fb.suburb) out.suburb = fb.suburb
  if (typeof fb.subTag === 'string' && fb.subTag) out.subTag = fb.subTag
  if (fb.paidOnly === true) out.paidOnly = true
  if (fb.isFree === true) out.isFree = true
  if (!out.city && typeof fb.city === 'string' && fb.city) out.city = fb.city
  if (Array.isArray(fb.keywords) && fb.keywords.length) out.keywords = fb.keywords as string[]
  out.categoryStrict = false
  out.nearMe = /\b(near me|nearby|around me)\b/i.test(q)
  return out
}

/**
 * Dropping the person's own words is only safe when they also asked for a real filter
 * (a category, a price, a time of day). Gibberish with no other signal stays an empty result.
 */
export function keywordRelaxAllowed(f: Pick<AiFilters, 'keywords' | 'category' | 'suburb' | 'isFree' | 'lgbtiq' | 'timeOfDay' | 'soon' | 'nearMe'>): boolean {
  if (!f.keywords.length || f.nearMe) return false
  return !!(f.category || f.suburb || f.isFree || f.lgbtiq || f.timeOfDay !== 'any' || f.soon)
}
