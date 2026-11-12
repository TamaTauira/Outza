/**
 * Genre holding art in public/placeholders/<slug>/<slot>.webp.
 * Each slot is drawn at that slot's aspect ratio, so the page shows the file
 * whole (object-contain) instead of cropping one poster into every frame.
 * Files are the 2× size of the largest box that slot is shown in.
 */

export const PLACEHOLDER_SLUGS = [
  'arts-culture',
  'business',
  'community',
  'education',
  'family',
  'food-drink',
  'music',
  'nightlife',
  'sports',
  'wellness',
] as const

export type PlaceholderSlug = (typeof PLACEHOLDER_SLUGS)[number]

/** Local sections. Each has its own holding art, separate from the ten genre folders. */
export const LOCAL_HOLDING_SLUGS = [
  'garage-sales',
  'warehouse-sales',
  'school-fundraisers',
  'farmers-markets',
  'neighbourhood-popups',
  'community-sport',
  'community-events',
  'charity-events',
  'dog-friendly',
  'local-art',
] as const

export type LocalHoldingSlug = (typeof LOCAL_HOLDING_SLUGS)[number]
export type HoldingSlug = PlaceholderSlug | LocalHoldingSlug

const LOCAL_HOLDING = new Set<string>(LOCAL_HOLDING_SLUGS)

/** Pixel size of the file for each slot. Aspect ratio is width / height. */
export const PLACEHOLDER_SLOTS = {
  /** Event hero below 640px, and the email hero. 16:9. */
  hero: { w: 1600, h: 900 },
  /** Event hero from 640px up. 3:1. */
  'hero-wide': { w: 2400, h: 800 },
  /** Board cards, home rails, promoter preview. 4:3. */
  card: { w: 1600, h: 1200 },
  /** Hot right now. 16:9. */
  featured: { w: 1920, h: 1080 },
  /** Guide rows and email thumbs. 1:1. */
  square: { w: 1000, h: 1000 },
  /** Round map pins. 1:1, composed inside the circle. */
  marker: { w: 512, h: 512 },
  /** Map popup. 5:2. */
  popup: { w: 1200, h: 480 },
  /** Community hub cards. 5:2. */
  band: { w: 1600, h: 640 },
  /** Open Graph / share image. 1200×630 at 2×. */
  og: { w: 2400, h: 1256 },
} as const

export type PlaceholderSlot = keyof typeof PLACEHOLDER_SLOTS

const SLUGS = new Set<string>(PLACEHOLDER_SLUGS)

/** Names and slugs that are not already one of the ten file stems. */
const ALIAS: Record<string, PlaceholderSlug> = {
  arts: 'arts-culture',
  culture: 'arts-culture',
  theatre: 'arts-culture',
  theater: 'arts-culture',
  comedy: 'arts-culture',
  film: 'arts-culture',
  art: 'arts-culture',
  food: 'food-drink',
  drink: 'food-drink',
  dining: 'food-drink',
  market: 'food-drink',
  markets: 'food-drink',
  sport: 'sports',
  kids: 'family',
  children: 'family',
  health: 'wellness',
  fitness: 'wellness',
  yoga: 'wellness',
  club: 'nightlife',
  garage: 'community',
  warehouse: 'community',
}

const DEFAULT_SLUG: PlaceholderSlug = 'community'

export function placeholderSlug(category?: string | null): HoldingSlug {
  const raw = (category ?? '').trim().toLowerCase()
  if (!raw) return DEFAULT_SLUG
  if (LOCAL_HOLDING.has(raw)) return raw as LocalHoldingSlug
  if (ALIAS[raw]) return ALIAS[raw]
  const slug = raw.replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (LOCAL_HOLDING.has(slug)) return slug as LocalHoldingSlug
  if (SLUGS.has(slug)) return slug as PlaceholderSlug
  if (ALIAS[slug]) return ALIAS[slug]
  return DEFAULT_SLUG
}

/** Site-relative path for one slot of a genre. Local sections rotate a second file when variant is 1. */
export function placeholderPath(category?: string | null, slot: PlaceholderSlot = 'hero', variant: 0 | 1 = 0): string {
  const slug = placeholderSlug(category)
  const file = variant === 1 && LOCAL_HOLDING.has(slug) ? `${slot}-b` : slot
  return `/placeholders/${slug}/${file}.webp`
}

export function placeholderAbsolute(category: string | null | undefined, slot: PlaceholderSlot, origin: string): string {
  const base = origin.replace(/\/+$/, '')
  return `${base}${placeholderPath(category, slot)}`
}

/** A real http(s) picture, otherwise the genre holding image for the slot. */
export function eventPictureSrc(imageUrl: string | null | undefined, category: string | null | undefined, slot: PlaceholderSlot = 'hero'): string {
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) return imageUrl
  return placeholderPath(category, slot)
}

/** True when the listing has its own picture, so the frame can stay a photo crop. */
export function hasListingPhoto(
  imageUrl?: string | null,
  variants?: { sizes?: Partial<Record<string, number[] | undefined>> } | null,
): boolean {
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) return true
  const sizes = variants?.sizes
  if (!sizes) return false
  return Object.values(sizes).some((widths) => !!widths?.length)
}
