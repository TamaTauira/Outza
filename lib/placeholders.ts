/** Genre artwork in public/placeholders/. Files are served as stored. */

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
export type PlaceholderShape = 'wide' | 'square'

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
  'garage-sales': 'community',
  'warehouse-sales': 'community',
  'school-fundraisers': 'family',
  'farmers-markets': 'food-drink',
  'neighbourhood-popups': 'community',
  'community-sport': 'sports',
  'charity-events': 'community',
  'dog-friendly': 'community',
  'local-art': 'arts-culture',
}

const DEFAULT_SLUG: PlaceholderSlug = 'community'

export function placeholderSlug(category?: string | null): PlaceholderSlug {
  const raw = (category ?? '').trim().toLowerCase()
  if (!raw) return DEFAULT_SLUG
  if (ALIAS[raw]) return ALIAS[raw]
  const slug = raw.replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (SLUGS.has(slug)) return slug as PlaceholderSlug
  if (ALIAS[slug]) return ALIAS[slug]
  return DEFAULT_SLUG
}

/** Site-relative path. Square crops use the -square file; everything else uses the wide file. */
export function placeholderPath(category?: string | null, shape: PlaceholderShape = 'wide'): string {
  const slug = placeholderSlug(category)
  return shape === 'square' ? `/placeholders/${slug}-square.webp` : `/placeholders/${slug}.webp`
}

export function placeholderAbsolute(category: string | null | undefined, shape: PlaceholderShape, origin: string): string {
  const base = origin.replace(/\/+$/, '')
  return `${base}${placeholderPath(category, shape)}`
}

/** A real http(s) picture, otherwise the genre placeholder for the crop. */
export function eventPictureSrc(imageUrl: string | null | undefined, category: string | null | undefined, shape: PlaceholderShape = 'wide'): string {
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) return imageUrl
  return placeholderPath(category, shape)
}
