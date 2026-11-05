/**
 * Pure decisions for scroll restoration. The browser listeners live in scroll-memory.ts.
 *
 * PR #102 shortened the header and pulled content up, so a saved scroll position often sits
 * past the short first paint (loading rows, page 1 of a paged list, rails that fetch in).
 * The old loop treated a stable-but-too-short page as finished and wrote that clamped
 * position over the real one. Restoration now waits until the document is tall enough,
 * paged lists have caught up, and nothing is still holding the page open.
 */

import { CITIES } from '@/lib/cities'

export const SCROLL_TIMEOUT_MS = 8000
export const SCROLL_STABLE_MS = 700
export const SCROLL_REACHED_MS = 400
/** Gives React effects time to register a hold before a short first paint looks "done". */
export const SCROLL_MIN_MS = 250

const LIST_ROOTS = new Set([
  '/',
  '/map',
  '/saved',
  '/local',
  '/itinerary',
  '/outings',
  '/watchlist',
  '/together',
])

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const CITY_SLUGS = new Set(CITIES.map((c) => slug(c.name)))

/** Pages whose scroll position should come back with the browser Back button or an in-app back link. */
export function isListPage(key: string): boolean {
  const path = (key.split('?')[0] || '/').replace(/\/$/, '') || '/'
  if (LIST_ROOTS.has(path)) return true
  if (path.startsWith('/local/in/') || path.startsWith('/guides/') || path.startsWith('/outings/')) return true
  const parts = path.split('/').filter(Boolean)
  if (!parts.length) return false
  // /sydney, /sydney/events, /sydney/tonight, suburb and topic landings.
  return CITY_SLUGS.has(parts[0])
}

export function shouldFinishRestore(input: {
  target: number
  maxScroll: number
  sinceHeightChange: number
  sinceReached: number
  holds: number
  elapsed: number
  fontsReady?: boolean
}): 'wait' | 'done' | 'timeout' {
  const fontsReady = input.fontsReady !== false
  if (input.elapsed >= SCROLL_TIMEOUT_MS) return 'timeout'
  if (input.holds > 0 || !fontsReady || input.elapsed < SCROLL_MIN_MS) return 'wait'
  const reached = input.maxScroll >= input.target - 1
  if (!reached) return 'wait'
  if (input.sinceHeightChange >= SCROLL_STABLE_MS && input.sinceReached >= SCROLL_REACHED_MS) return 'done'
  return 'wait'
}

/** How many board pages to ask for again. Never less than 1, never a runaway. */
export function listDepthToLoad(saved: number | null, totalPages: number): number {
  const want = saved == null || !Number.isFinite(saved) ? 1 : Math.max(1, Math.floor(saved))
  const cap = totalPages > 0 ? totalPages : want
  return Math.min(want, cap, 8)
}
