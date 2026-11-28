import type { TimeWindow } from '@/lib/board'

/**
 * Identity of one board query: every input that decides which rows the
 * board fetch returns — the span, the city, the search text and the
 * filter fields, in the same terms the fetch itself uses. Two fetches
 * with the same key are the same query; a different key is a different
 * query, and data held from the old one must not be presented as the
 * new one's. That is the rule cityDataIsStale (lib/city-pref.ts)
 * applies to the city on its own, extended to the whole query.
 */
export type BoardQueryParts = {
  from: string
  to: string
  city?: string | null
  search?: string
  categories?: string[]
  subTag?: string
  suburb?: string
  isFree?: boolean
  isLGBTI?: boolean
}

export function boardQueryKey(parts: BoardQueryParts): string {
  return JSON.stringify([
    parts.from,
    parts.to,
    parts.city ?? '',
    parts.search ?? '',
    [...(parts.categories ?? [])].sort().join(','),
    parts.subTag ?? '',
    parts.suburb ?? '',
    parts.isFree ? '1' : '',
    parts.isLGBTI ? '1' : '',
  ])
}

/**
 * True when data a surface is holding was loaded for a different board
 * query than the one now selected, so it must not be presented under
 * the current query — the surface shows its loading state until the
 * fetch for the current query lands. `dataKey` is the key the held
 * data was loaded under (null when the surface has not recorded one);
 * `held` is how much data is being held (rows, a total, or both). An
 * empty hand is never stale.
 */
export function boardDataIsStale(dataKey: string | null, currentKey: string, held: number): boolean {
  return held > 0 && dataKey !== currentKey
}

/**
 * Whether this board's first load must fetch the span's whole set
 * because its stated count may be derived from the rows it holds —
 * the one decision both the load (boardPagesToLoad's `windowed`
 * input) and the count gate (boardCountGate's `windowed` input)
 * take, so the two can never disagree about whether the board is
 * windowed.
 *
 * A pinned board's effective window is its requested window, so it
 * is windowed exactly when the request is. An unpinned board is
 * different: its effective window is only chosen once rows land, and
 * EventList's fallback chain promotes it to 'evening' whenever the
 * requested window counts nothing but the evening counts something.
 * If the load had read the request alone — an unpinned 'all' loading
 * at restoration depth — that promotion produced a window-derived
 * count over page 1 with the gate holding "…" and nothing left to
 * release it: the load effect never re-runs for a window change, and
 * the collapsed board has no Show More. Reachable from a restored
 * session, whose saved window comes back 'all' while the pin does
 * not survive. So an unpinned board loads as windowed whatever it
 * requested. The cost is a few extra page fetches on unpinned 'all'
 * boards; when their effective window stays 'all', the gate simply
 * lifts the moment the set lands (or falls back to the server's
 * full-set numbers if the page ceiling bound the load — the same
 * numbers the unwindowed board states).
 */
export function boardLoadIsWindowed(input: { requestedWindow: TimeWindow; windowPinned?: boolean }): boolean {
  return input.requestedWindow !== 'all' || !input.windowPinned
}

/**
 * Whether a board's stated count may be published yet, and as what. A
 * windowed count ('now' / 'evening' / 'hour') is derived from the rows
 * the list holds, so while the first load is still fetching the span's
 * remaining pages any number it produced would be a partial sum that
 * grows as the appends land — the count is 'gated' (the summary holds
 * its loading treatment and the surface reports 0) until the held pages
 * reach the span's page total. When the first load's page ceiling bound
 * the load (see boardPagesToLoad in lib/scroll-restore.ts), the held
 * set can never complete; rather than publish the partial sum as final,
 * the headline 'fallback's to the server's full-set numbers for the
 * span — the same numbers the unwindowed board states. An unwindowed
 * board derives its count from the server set from the first response,
 * so it is always 'ready'. Callers pass boardLoadIsWindowed as
 * `windowed` — the same decision the first load takes — so a board
 * this gate holds is always one whose load was commanded to fetch
 * the whole set, and the gate always has a load that can lift it.
 */
export function boardCountGate(input: { windowed: boolean; heldPages: number; totalPages: number; capped: boolean }): 'gated' | 'fallback' | 'ready' {
  if (!input.windowed) return 'ready'
  if (input.heldPages >= input.totalPages) return 'ready'
  return input.capped ? 'fallback' : 'gated'
}
