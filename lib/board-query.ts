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
