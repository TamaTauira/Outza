/**
 * Humanitix AU coverage that does not fit in one hourly budget.
 * The city pages only embed a featured set. The AU sitemap lists every public
 * event URL. A run walks a saved index, soonest slug-dated events first, and
 * the next hour continues. Pure so the split can be tested without fetching.
 */

export const HUMANITIX_SOON_DAYS = 60
/** Event-page gap. Sitemap shards are fewer and larger, so they wait less. */
export const HUMANITIX_GAP_MS = 300
export const HUMANITIX_SHARD_GAP_MS = 150
/** City pages touched each run, so carousel cards keep moving while the sitemap walks. */
export const HUMANITIX_FEATURED_PAGES_PER_RUN = 2
/**
 * Featured city pages and their carousel cards get this long, then the sitemap
 * takes the rest. Soon events (including ones missing from the city pages) stay
 * inside the same hourly budget.
 */
export const HUMANITIX_FEATURED_BUDGET_MS = 6_000

const MONTH_TOKEN = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

const RESERVED_SLUGS = new Set(['tickets', 'host', 'sitemaps', 'widget', 'api', '_app', 'embed', 'accessibility'])

export type HumanitixListing = {
  title: string
  description: string | null
  start: Date
  end: Date | null
  venueName: string
  venueAddress: string | null
  locality: string | null
  region: string | null
  postcode: string | null
  lat: number | null
  lng: number | null
  country: string | null
  genres: string[]
  prices: number[]
  imageUrl: string | null
  url: string
  slug: string
  passed: boolean
  listed: boolean
  status: 'CANCELLED' | 'POSTPONED' | 'SCHEDULED'
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function ymd(year: number, month: number, day: number): string | null {
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
  return d.toISOString().slice(0, 10)
}

function monthNumber(token: string): number | null {
  const key = token.toLowerCase()
  if (MONTHS[key]) return MONTHS[key]
  return MONTHS[key.slice(0, 3)] ?? null
}

function resolveDate(month: number, day: number, year: number | null, today: string): string | null {
  if (year) return ymd(year, month, day)
  const todayYear = Number(today.slice(0, 4))
  const thisYear = ymd(todayYear, month, day)
  if (thisYear && thisYear >= today) return thisYear
  return ymd(todayYear + 1, month, day)
}

/** A date written into the slug, if the slug actually states one. */
export function slugEventDate(slug: string, today: string): string | null {
  const dayMonth = new RegExp(`(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?[\\s-]*(${MONTH_TOKEN})(?![a-z])(?:[\\s-]*(20\\d{2}))?`, 'gi')
  const monthDay = new RegExp(`(${MONTH_TOKEN})(?![a-z])[\\s-]*(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?(?:[\\s-]*(20\\d{2}))?`, 'gi')
  const found = new Set<string>()
  const consider = (monthToken: string, dayText: string, yearText: string | undefined) => {
    const month = monthNumber(monthToken)
    const day = Number(dayText)
    if (!month || !Number.isFinite(day)) return
    const date = resolveDate(month, day, yearText ? Number(yearText) : null, today)
    if (date) found.add(date)
  }
  for (const match of slug.matchAll(dayMonth)) consider(match[2], match[1], match[3])
  for (const match of slug.matchAll(monthDay)) consider(match[1], match[2], match[3])
  if (!found.size) return null
  const upcoming = [...found].filter((date) => date >= today).sort()
  if (upcoming.length) return upcoming[0]
  return [...found].sort().at(-1) ?? null
}

/**
 * Soon events whose slug states a date in the next HUMANITIX_SOON_DAYS, soonest first.
 * Everything else keeps sitemap order so the numeric cursor stays put when a shard is stable.
 */
export function orderHumanitixUrls(urls: string[], today: string): string[] {
  const soonEnd = addDaysYmd(today, HUMANITIX_SOON_DAYS)
  const seen = new Set<string>()
  const soon: { date: string; url: string }[] = []
  const rest: string[] = []
  for (const url of urls) {
    if (seen.has(url)) continue
    seen.add(url)
    const slug = url.slice(url.lastIndexOf('/') + 1)
    const date = slugEventDate(slug, today)
    if (date && date >= today && date <= soonEnd) soon.push({ date, url })
    else rest.push(url)
  }
  soon.sort((a, b) => a.date.localeCompare(b.date) || a.url.localeCompare(b.url))
  return [...soon.map((row) => row.url), ...rest]
}

export function humanitixAuShardUrls(indexXml: string): string[] {
  const out: string[] = []
  for (const match of indexXml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)) {
    const loc = decodeXml(match[1].trim())
    if (/\/sitemap-au-\d+\.xml(?:\?|$)/i.test(loc)) out.push(loc)
  }
  return out
}

/** One event URL. Ticket checkout URLs and anything that is not an event path are dropped. */
export function humanitixEventUrlFromHref(raw: string): string | null {
  let url: URL
  try { url = new URL(raw.trim()) } catch { return null }
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  if (host !== 'events.humanitix.com') return null
  const parts = url.pathname.split('/').filter(Boolean).map((part) => {
    try { return decodeURIComponent(part) } catch { return part }
  })
  if (parts.length !== 1) return null
  const slug = parts[0]
  if (!slug || RESERVED_SLUGS.has(slug.toLowerCase())) return null
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(slug)) return null
  return `https://events.humanitix.com/${slug}`
}

export function humanitixEventUrlsFromShard(xml: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const match of xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)) {
    const url = humanitixEventUrlFromHref(decodeXml(match[1].trim()))
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

/** Carousel cards link via primaryButtonHref. They do not carry name or startDate. */
export function humanitixCarouselUrls(carouselEntries: unknown): string[] {
  if (!Array.isArray(carouselEntries)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const entry of carouselEntries) {
    if (!entry || typeof entry !== 'object') continue
    const href = (entry as { primaryButtonHref?: unknown }).primaryButtonHref
    if (typeof href !== 'string') continue
    const url = humanitixEventUrlFromHref(href)
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

export function featuredSlice(slot: number, count: number, total: number): number[] {
  if (total <= 0 || count <= 0) return []
  const start = ((Math.floor(slot) % total) + total) % total
  const n = Math.min(Math.floor(count), total)
  return Array.from({ length: n }, (_, i) => (start + i) % total)
}

export function featuredSlotAfter(slot: number, taken: number, total: number): number {
  if (total <= 0) return 0
  const start = ((Math.floor(slot) % total) + total) % total
  return (start + Math.max(0, Math.floor(taken))) % total
}

/**
 * Index into the ordered URL list. Past the end, the sweep finished and the next one starts at 0.
 * featuredSlot is the city-page rotation and is not part of the sweep total.
 */
export function humanitixResume(storedIndex: number | null | undefined, urlCount: number): { index: number; continuation: boolean; done: boolean } {
  const index = storedIndex != null && Number.isFinite(storedIndex) && storedIndex > 0 ? Math.floor(storedIndex) : 0
  if (urlCount > 0 && index >= urlCount) return { index: 0, continuation: true, done: true }
  return { index, continuation: index > 0, done: false }
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

/** Rich-text description as plain text. saveEvent still applies its own length cap. */
export function humanitixPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** Prefer the original asset. SEO and responsive renditions are the same image, smaller. */
export function humanitixOriginalImage(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null
  return trimmed.replace(/@(?:seo|responsive)-\d+\.(?:jpe?g|png|webp|gif)/i, '@original')
}

function parseInstant(value: string): Date | null {
  const normalised = value.trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
  const ms = Date.parse(normalised)
  return Number.isFinite(ms) ? new Date(ms) : null
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string') return parseInstant(value)
  return null
}

/** SvelteKit __data.json stores a flat pool. Integers inside containers point at other slots. -1 is empty. */
export function unflattenHumanitixPool(pool: unknown[]): unknown {
  const resolving = new Set<number>()
  const walk = (value: unknown): unknown => {
    if (typeof value === 'number' && Number.isInteger(value)) {
      if (value === -1) return null
      if (value < 0 || value >= pool.length) return null
      return at(value)
    }
    if (Array.isArray(value)) {
      const out = value.map(walk)
      if (out.length >= 2 && out[0] === 'Date' && typeof out[1] === 'string') return parseInstant(out[1])
      return out
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {}
      for (const [key, inner] of Object.entries(value)) out[key] = walk(inner)
      return out
    }
    return value
  }
  const at = (index: number): unknown => {
    if (resolving.has(index)) return null
    const raw = pool[index]
    if (typeof raw !== 'object' || raw === null) return raw
    resolving.add(index)
    const out = walk(raw)
    resolving.delete(index)
    return out
  }
  return at(0)
}

function eventRoot(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null
  const nodes = (payload as { nodes?: unknown }).nodes
  if (!Array.isArray(nodes)) return null
  for (const node of nodes) {
    const data = node && typeof node === 'object' ? (node as { data?: unknown }).data : null
    if (!Array.isArray(data) || !data.length) continue
    const root = unflattenHumanitixPool(data)
    if (!root || typeof root !== 'object' || Array.isArray(root)) continue
    const event = (root as { event?: unknown }).event
    if (event && typeof event === 'object' && !Array.isArray(event)) return root as Record<string, unknown>
  }
  return null
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function descriptionOf(event: Record<string, unknown>, schema: Record<string, unknown> | null): string | null {
  const parts: string[] = []
  const modules = Array.isArray(event.eventModules) ? event.eventModules : []
  for (const mod of modules) {
    if (!mod || typeof mod !== 'object') continue
    const props = (mod as { props?: unknown }).props
    const content = props && typeof props === 'object' ? (props as { content?: unknown }).content : null
    if (typeof content !== 'string' || !content.trim()) continue
    parts.push(content.includes('<') ? humanitixPlainText(content) : content.trim())
  }
  const full = parts.filter(Boolean).join('\n\n').trim()
  if (full) return full
  const seo = event.seo
  const descriptions = seo && typeof seo === 'object' ? (seo as { descriptions?: unknown }).descriptions : null
  const openGraph = descriptions && typeof descriptions === 'object' ? text((descriptions as { openGraph?: unknown }).openGraph) : null
  if (openGraph) return openGraph
  return schema ? text(schema.description) : null
}

function pricesOf(schema: Record<string, unknown> | null): number[] {
  if (!schema) return []
  const raw = schema.offers
  const offers = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : []
  const nums: number[] = []
  for (const offer of offers) {
    if (!offer || typeof offer !== 'object') continue
    const row = offer as Record<string, unknown>
    const type = typeof row['@type'] === 'string' ? row['@type'] : ''
    const keys = type === 'AggregateOffer' ? ['lowPrice', 'highPrice'] : ['price']
    for (const key of keys) {
      const n = typeof row[key] === 'number' ? row[key] : typeof row[key] === 'string' ? Number(row[key]) : NaN
      if (Number.isFinite(n) && n >= 0 && n < 100000) nums.push(Math.round(n * 100) / 100)
    }
  }
  return nums
}

function imageOf(event: Record<string, unknown>, schema: Record<string, unknown> | null): string | null {
  const images = event.images
  const banner = images && typeof images === 'object' ? (images as { banner?: unknown }).banner : null
  const thumb = images && typeof images === 'object' ? (images as { thumbnail?: unknown }).thumbnail : null
  const bannerSrc = banner && typeof banner === 'object' ? text((banner as { src?: unknown }).src) : null
  const thumbSrc = thumb && typeof thumb === 'object' ? text((thumb as { src?: unknown }).src) : null
  const schemaImage = schema ? text(schema.image) : null
  return humanitixOriginalImage(bannerSrc) || humanitixOriginalImage(thumbSrc) || humanitixOriginalImage(schemaImage)
}

function pinOf(latLng: string | null): { lat: number | null; lng: number | null } {
  if (!latLng) return { lat: null, lng: null }
  const [latText, lngText] = latLng.split(',')
  const lat = Number(latText?.trim())
  const lng = Number(lngText?.trim())
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { lat: null, lng: null }
  return { lat, lng }
}

function postcodeOf(address: string | null): string | null {
  if (!address) return null
  const labelled = address.match(/\b(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s+(0?\d{3,4})\b/i)
  if (labelled?.[1]) return labelled[1]
  const bare = address.match(/\b(\d{4})\b/)
  return bare?.[1] ?? null
}

function countryOf(event: Record<string, unknown>, location: Record<string, unknown>, schema: Record<string, unknown> | null): string | null {
  const fromEvent = text(event.locationCode) || text(location.country)
  if (fromEvent) return fromEvent
  const schemaLoc = schema?.location
  const address = schemaLoc && typeof schemaLoc === 'object' ? (schemaLoc as { address?: unknown }).address : null
  const country = address && typeof address === 'object' ? text((address as { addressCountry?: unknown }).addressCountry) : null
  return country
}

function statusOf(schema: Record<string, unknown> | null): 'CANCELLED' | 'POSTPONED' | 'SCHEDULED' {
  const raw = schema ? text(schema.eventStatus) : null
  if (raw && /cancelled/i.test(raw)) return 'CANCELLED'
  if (raw && /postponed/i.test(raw)) return 'POSTPONED'
  return 'SCHEDULED'
}

function genresOf(event: Record<string, unknown>): string[] {
  const classification = event.classification
  const category = classification && typeof classification === 'object' ? text((classification as { category?: unknown }).category) : null
  const subcategory = classification && typeof classification === 'object' ? text((classification as { subcategory?: unknown }).subcategory) : null
  const keywords = Array.isArray(event.keywords) ? event.keywords.filter((word): word is string => typeof word === 'string' && !!word.trim()) : []
  const out: string[] = []
  for (const value of [category, subcategory, ...keywords]) {
    if (!value) continue
    const cleaned = value.trim()
    if (!cleaned || out.includes(cleaned)) continue
    out.push(cleaned)
    if (out.length >= 8) break
  }
  return out
}

function startsOf(event: Record<string, unknown>, schema: Record<string, unknown> | null): { start: Date; end: Date | null }[] {
  const pairs: { start: Date; end: Date | null }[] = []
  const push = (start: Date | null, end: Date | null) => {
    if (!start) return
    if (pairs.some((pair) => pair.start.getTime() === start.getTime())) return
    pairs.push({ start, end })
  }
  const dates = event.dates
  const dateRow = dates && typeof dates === 'object' ? dates as Record<string, unknown> : null
  push(schema ? asDate(schema.startDate) : null, schema ? asDate(schema.endDate) : null)
  push(dateRow ? asDate(dateRow.startDate) : null, dateRow ? asDate(dateRow.endDate) : null)
  const occurrences = Array.isArray(event.occurrences) ? event.occurrences : []
  for (const occurrence of occurrences) {
    if (!occurrence || typeof occurrence !== 'object') continue
    const row = occurrence as Record<string, unknown>
    push(asDate(row.startDate), asDate(row.endDate))
  }
  return pairs
}

/** Listings on one event payload. Empty when the page is not an event. */
export function humanitixListingsFromPayload(payload: unknown): HumanitixListing[] {
  const root = eventRoot(payload)
  if (!root) return []
  const event = root.event as Record<string, unknown>
  const schemaText = text(root.eventJsonSchema)
  let schema: Record<string, unknown> | null = null
  if (schemaText) {
    try {
      const parsed = JSON.parse(schemaText)
      if (parsed && typeof parsed === 'object') schema = parsed as Record<string, unknown>
    } catch { schema = null }
  }
  const slug = text(event.eventSlug)
  const title = text(event.title) || (schema ? text(schema.name) : null)
  if (!slug || !title) return []
  const location = event.location && typeof event.location === 'object' ? event.location as Record<string, unknown> : {}
  const schemaPlace = schema?.location && typeof schema.location === 'object' ? schema.location as Record<string, unknown> : null
  const schemaAddress = schemaPlace?.address && typeof schemaPlace.address === 'object' ? schemaPlace.address as Record<string, unknown> : null
  const venueName = text(location.venueName) || (schemaPlace ? text(schemaPlace.name) : null) || 'TBA'
  const venueAddress = text(location.address) || (schemaAddress ? text(schemaAddress.streetAddress) : null)
  const locality = text(location.locality) || (schemaAddress ? text(schemaAddress.addressLocality) : null)
  const region = schemaAddress ? text(schemaAddress.addressRegion) : null
  const pin = pinOf(text(location.latLng))
  const starts = startsOf(event, schema)
  if (!starts.length) return []
  const description = descriptionOf(event, schema)
  const shared = {
    title,
    description,
    venueName,
    venueAddress,
    locality,
    region,
    postcode: postcodeOf(venueAddress),
    lat: pin.lat,
    lng: pin.lng,
    country: countryOf(event, location, schema),
    genres: genresOf(event),
    prices: pricesOf(schema),
    imageUrl: imageOf(event, schema),
    url: `https://events.humanitix.com/${slug}`,
    slug,
    passed: event.eventHasPassed === true,
    listed: event.published !== false && event.public !== false && event.showDraft !== true,
    status: statusOf(schema),
  }
  return starts.map((pair) => ({ ...shared, start: pair.start, end: pair.end }))
}

export function humanitixListingsFromJson(body: string): HumanitixListing[] {
  try {
    return humanitixListingsFromPayload(JSON.parse(body))
  } catch {
    return []
  }
}
