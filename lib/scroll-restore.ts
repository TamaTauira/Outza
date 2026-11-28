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

/** The deepest first load the board ever makes, in pages. This was the
 * ceiling on every first load before the windowed full load existed
 * (listDepthToLoad caps there too); the full load keeps it as its own
 * bound, so it can never make a first load deeper than the deepest one
 * the site already made for scroll restoration. At 300 rows a page the
 * bound is 2,400 rows — a single day is a handful of pages at most
 * (Sydney's biggest ≈ 2), so the bound is headroom, not an expected
 * case. A load the bound stops short is never mistaken for a complete
 * set: the count gate (boardCountGate) treats it as capped. */
export const BOARD_FULL_LOAD_PAGE_CAP = 8

/**
 * How many pages the board's first load fetches. A single-day span can
 * carry a time window ('now' / 'evening' / 'hour'), and the window's
 * sections and its stated count are computed from the rows the list
 * holds — page 1 alone understates both whenever the day runs past one
 * page, and the count then grows as the visitor pages (the Today preset
 * states the same day's full set). So a windowed single-day board loads
 * every page up front, up to BOARD_FULL_LOAD_PAGE_CAP. An unwindowed
 * ('all') board states a server-derived count and pages on demand, so
 * it keeps the restoration depth, as do spanning spans (their count is
 * server-derived too) and previews (they only ever show a slice).
 */
export function boardPagesToLoad(input: { saved: number | null; totalPages: number; spanning: boolean; preview: boolean; windowed: boolean }): number {
  if (!input.spanning && !input.preview && input.windowed && input.totalPages > 0) return Math.min(input.totalPages, BOARD_FULL_LOAD_PAGE_CAP)
  return listDepthToLoad(input.saved, input.totalPages)
}
