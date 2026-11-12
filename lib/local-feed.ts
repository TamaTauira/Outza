/**
 * One neighbourhood feed. Local sales and community submissions share a section
 * and a date, and the same real-world listing is shown once.
 */
import { suburbMatches } from '@/lib/community-shared'

export interface FeedItem {
  id: string
  title: string
  section: string
  suburb: string
  city: string
  date: string
  time: string | null
  endTime?: string | null
  isFree: boolean
  price: string | null
  href: string
  kind: 'local' | 'community'
  status?: string | null
  /** Public pin. School listings never receive a street coordinate. */
  lat?: number | null
  lng?: number | null
  /** Short fact from the listing text. Never invented. */
  blurb?: string | null
  /** The listing's own picture. Empty when there isn't one; the page uses a genre holding image then. */
  imageUrl?: string | null
}

/** First real http(s) picture. Holding art is chosen by the page, not stored here. */
export function feedPhoto(urls: Array<string | null | undefined>): string | null {
  for (const url of urls) {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) return url
  }
  return null
}

/** A card line from the listing's own words. Too-short blurbs stay off the card. */
export function feedBlurb(text: string | null | undefined): string | null {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim()
  if (clean.length < 12) return null
  if (clean.length <= 160) return clean
  const cut = clean.slice(0, 157).replace(/\s+\S*$/, '').trim()
  return `${cut || clean.slice(0, 157).trim()}…`
}

const norm = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '')

export function feedKey(item: Pick<FeedItem, 'city' | 'suburb' | 'title' | 'date'>): string {
  return `${norm(item.city)}|${norm(item.suburb)}|${norm(item.title)}|${item.date}`
}

/** Community rows win when a sale was also imported into VibePeep Local. */
export function dedupeFeed(items: FeedItem[]): FeedItem[] {
  const ranked = [...items].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'community' ? -1 : 1))
  const seen = new Set<string>()
  const out: FeedItem[] = []
  for (const item of ranked) {
    const key = feedKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title))
}

export function sectionForText(title: string, description?: string | null, category?: string | null): string {
  if (category === 'GARAGE') return 'garage-sales'
  if (category === 'WAREHOUSE') return 'warehouse-sales'
  if (category === 'MARKET') return 'farmers-markets'
  const text = `${title} ${description ?? ''}`
  if (/\b(garage|car-?boot)\b/i.test(text)) return 'garage-sales'
  if (/\b(warehouse|clearance)\b/i.test(text)) return 'warehouse-sales'
  if (/\b(school|fete|sausage sizzle)\b/i.test(text)) return 'school-fundraisers'
  if (/\b(markets?|farmers)\b/i.test(title)) return 'farmers-markets'
  if (/\b(dog|puppy|pup)\b/i.test(text)) return 'dog-friendly'
  if (/\b(markets?|farmers)\b/i.test(text)) return 'farmers-markets'
  if (/\b(run(?:ning)? club|park ?runs?|athletics|sport|football|netball|cricket|soccer|footy|tennis)\b/i.test(text)) return 'community-sport'
  if (/\b(bird(?:ing|s|watch(?:ing)?)?|nature group|bushwalk|wildlife|conservation)\b/i.test(text)) return 'community-events'
  if (/\b(charity|fundraiser|donate|appeal)\b/i.test(text)) return 'charity-events'
  if (/\b(pop-?ups?|popup|stall)\b/i.test(text)) return 'neighbourhood-popups'
  if (/\b(art|exhibition|gallery|studio)\b/i.test(text)) return 'local-art'
  if (category === 'COMMUNITY') return 'community-events'
  return 'community-events'
}

export function sectionForLocal(listing: { category: string; title: string; description?: string | null }): string {
  return sectionForText(listing.title, listing.description, listing.category)
}

/** A stored Pop-up (or a generic community tag) loses to a clearer reading of the title. A deliberate other tag stays. */
export function refineStoredSection(stored: string | null | undefined, title: string, description?: string | null): string {
  const guessed = sectionForText(title, description)
  if (!stored || stored === 'neighbourhood-popups') return guessed
  if (stored === 'community-events' && guessed !== 'community-events') return guessed
  return stored
}

export function filterFeed(items: FeedItem[], opts: { section?: string; suburb?: string }): FeedItem[] {
  return items.filter((item) => {
    if (opts.section && item.section !== opts.section) return false
    if (opts.suburb && !suburbMatches(item.suburb, opts.suburb)) return false
    return true
  })
}

const inAustralia = (lat: number, lng: number) => lat > -45 && lat < -9 && lng > 112 && lng < 155

function usablePin(pin: { lat?: number | null; lng?: number | null } | null): { lat: number; lng: number } | null {
  if (!pin || pin.lat == null || pin.lng == null) return null
  const lat = Number(pin.lat)
  const lng = Number(pin.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inAustralia(lat, lng)) return null
  return { lat, lng }
}

/**
 * Pin shown on the Local map. A school fundraiser stays on the suburb centroid
 * even when a street geocode exists. Anything else prefers the stored pin.
 */
export function chooseFeedPin(
  section: string,
  stored: { lat?: number | null; lng?: number | null } | null,
  suburb: { lat?: number | null; lng?: number | null } | null,
): { lat: number; lng: number } | null {
  if (section === 'school-fundraisers') return usablePin(suburb)
  return usablePin(stored) ?? usablePin(suburb)
}

export function sectionCounts(items: FeedItem[]): Record<string, number> {
  const seen = new Set<string>()
  const counts: Record<string, number> = {}
  for (const item of items) {
    const id = `${item.kind}|${item.id}`
    if (seen.has(id)) continue
    seen.add(id)
    counts[item.section] = (counts[item.section] ?? 0) + 1
  }
  return counts
}
