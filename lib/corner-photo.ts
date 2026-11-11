import { sectionByKey } from '@/lib/community-shared'
import { placeholderPath } from '@/lib/placeholders'

/**
 * Corner block on the homepage. A listing qualifies from its community type,
 * category, or tags. The title is only a fallback. Venue and address text
 * never count, so "31 Market Street" is not a market.
 */
const KIND = /\b(?:markets?|garage sales?|fetes?|fundraisers?|pop-?ups?|pop ups?|community)\b/i

export const CORNER_ARTWORK = placeholderPath('Community', 'hero')

export type CornerListing = {
  title: string
  category?: string | null
  communityKey?: string | null
  subTags?: string[] | null
  imageUrl?: string | null
  venueName?: string | null
  venueAddress?: string | null
}

export const usableListingPhoto = (url?: string | null) =>
  !!url && /^https?:\/\//i.test(url) && !/picsum\.photos/i.test(url)

/** Higher means a closer local/community match. Zero means this listing is not a corner photo. */
export function cornerMatchScore(ev: CornerListing): number {
  if (ev.communityKey && sectionByKey(ev.communityKey)) return 8
  if (KIND.test((ev.subTags ?? []).join(' '))) return 7
  if ((ev.category ?? '').trim().toLowerCase() === 'community') return 6
  if (KIND.test(ev.title ?? '')) return 3
  return 0
}

export function pickCornerPhoto(
  events: CornerListing[],
  options: { localPhoto?: string | null; used?: Set<string> } = {},
): string {
  const used = options.used ?? new Set<string>()
  const ranked = events
    .map((ev) => ({ ev, score: cornerMatchScore(ev) }))
    .filter((row) => row.score > 0 && usableListingPhoto(row.ev.imageUrl) && !used.has(row.ev.imageUrl!))
    .sort((a, b) => b.score - a.score || a.ev.title.localeCompare(b.ev.title))
  const chosen = ranked[0]?.ev.imageUrl
  if (chosen) {
    used.add(chosen)
    return chosen
  }
  const local = options.localPhoto
  if (usableListingPhoto(local) && !used.has(local!)) {
    used.add(local!)
    return local!
  }
  return CORNER_ARTWORK
}
