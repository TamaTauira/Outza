import { placeholderPath } from '@/lib/placeholders'

/**
 * Corner photo on the homepage.
 * A listing picture is used only for a genuine Local type (garage sale, market,
 * fete, fundraiser, pop-up, community) and only when we know the file is a
 * scene rather than a text poster. Remote images do not say which they are,
 * so the corner uses the Local page hero instead of guessing.
 */
const LOCAL_TYPES = new Set([
  'garage-sales',
  'farmers-markets',
  'school-fundraisers',
  'charity-events',
  'neighbourhood-popups',
  'community-sport',
])

/** Same file the Local page shows in its hero when a listing has no picture. */
export const LOCAL_PAGE_HERO = placeholderPath('Community', 'hero')

export type CornerListing = {
  title: string
  category?: string | null
  communityKey?: string | null
  subTags?: string[] | null
  imageUrl?: string | null
  venueName?: string | null
  venueAddress?: string | null
}

export const isGenuineLocalType = (ev: CornerListing) => !!ev.communityKey && LOCAL_TYPES.has(ev.communityKey)

/**
 * True only when the picture is known to be a scene. A URL, a board category,
 * or a title cannot prove that, so this stays false and the hero is used.
 */
export function listingPhotoIsScene(_ev: CornerListing): boolean {
  return false
}

export function pickCornerPhoto(
  events: CornerListing[],
  options: { used?: Set<string> } = {},
): string {
  const used = options.used ?? new Set<string>()
  const scene = events.find((ev) => isGenuineLocalType(ev) && listingPhotoIsScene(ev) && ev.imageUrl && !used.has(ev.imageUrl))
  if (scene?.imageUrl) {
    used.add(scene.imageUrl)
    return scene.imageUrl
  }
  return LOCAL_PAGE_HERO
}
