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
  isFree: boolean
  price: string | null
  href: string
  kind: 'local' | 'community'
  status?: string | null
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

export function sectionForLocal(listing: { category: string; title: string; description?: string | null }): string {
  if (listing.category === 'GARAGE') return 'garage-sales'
  if (listing.category === 'WAREHOUSE') return 'warehouse-sales'
  if (listing.category === 'MARKET') return /\bfarmers?\b/i.test(listing.title) ? 'farmers-markets' : 'neighbourhood-popups'
  const text = `${listing.title} ${listing.description ?? ''}`
  if (/\b(school|fete|sausage sizzle)\b/i.test(text)) return 'school-fundraisers'
  if (/\b(dog|puppy|pup)\b/i.test(text)) return 'dog-friendly'
  if (/\b(charity|fundraiser|donate|appeal)\b/i.test(text)) return 'charity-events'
  if (/\b(sport|football|netball|park ?run|cricket|soccer)\b/i.test(text)) return 'community-sport'
  if (/\b(art|exhibition|gallery|studio)\b/i.test(text)) return 'local-art'
  return 'neighbourhood-popups'
}

export function filterFeed(items: FeedItem[], opts: { section?: string; suburb?: string }): FeedItem[] {
  return items.filter((item) => {
    if (opts.section && item.section !== opts.section) return false
    if (opts.suburb && !suburbMatches(item.suburb, opts.suburb)) return false
    return true
  })
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
