import type { TimeWindow } from './board'

/**
 * The board's quiet-city empty state: when a city board's query has
 * genuinely come back with nothing, the board says so in the owner's
 * approved words and points at the two places the city is likelier to
 * be awake — the coming weekend (a live preview, when it has anything)
 * and VibePeep Local. This module holds the state's pure decisions:
 * whether the board is genuinely empty, and the exact copy it renders.
 * The weekend span itself is the site's own (weekendRange in lib/seo,
 * the This-weekend preset's definition); the preview rows come through
 * the board's own feed (/api/events), scoped to the same city.
 */

/** How many weekend rows the quiet state previews. */
export const WEEKEND_PEEK_LIMIT = 4

/**
 * True only when the board's current query has genuinely returned
 * zero events for the selected city — as opposed to a load that is
 * still running, failed, or never landed. The distinction rides on
 * dataKey: EventList records the key of every successful fetch (and
 * of the server seed it applied), so held data whose key is the
 * current query's key is that query's own answer; a failed fetch
 * records nothing, leaving the key stale or null, and the board keeps
 * its existing loading/error presentation instead of declaring the
 * city quiet. The state is also today's board only (the approved copy
 * speaks of today and tonight) and a single day's (a spanning,
 * date-range view keeps its widen-the-dates guidance), and it never
 * fires without a selected city — the copy names one.
 */
export function boardGenuinelyEmpty(input: {
  city?: string | null
  spanning: boolean
  isToday: boolean
  loading: boolean
  offline: boolean
  dataKey: string | null
  queryKey: string | null
  total: number
  heldRows: number
}): boolean {
  if (!input.city) return false
  if (input.spanning || !input.isToday) return false
  if (input.loading || input.offline) return false
  if (input.queryKey === null || input.dataKey !== input.queryKey) return false
  return input.total === 0 && input.heldRows === 0
}

/**
 * The quiet state's words, in the owner's approved pattern: an honest
 * admission, then the weekend nudge and the Local nudge, verbatim.
 * `place` is the board's display name (boardDisplayName — the region
 * label on the Sydney board). The admission is the only moving part:
 * a search names what was searched for, a single picked category
 * names it, and the evening window says "tonight" where the others
 * say "today". A search outranks a category (it is the narrower
 * admission), and a multi-category pick falls back to the plain
 * admission rather than naming one of several.
 */
export function quietBoardCopy(input: {
  place: string
  window: TimeWindow
  category?: string
  search?: string
}): { headline: string; body: string } {
  const when = input.window === 'evening' ? 'tonight' : 'today'
  const search = input.search?.trim() ?? ''
  const admission = search
    ? `Nothing on for “${search}” in ${input.place} ${when}`
    : input.category
      ? `Quiet one for ${input.category} in ${input.place} ${when}`
      : `Quiet one in ${input.place} ${when}`
  return {
    headline: `${admission} — even the city's having a night in.`,
    body: `Peek at the weekend instead; that's when ${input.place} usually wakes up. And take a peep at VibePeep Local — something might be bubbling up there.`,
  }
}
