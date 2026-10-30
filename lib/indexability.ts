/**
 * Shared indexability threshold for local landing pages.
 *
 * Other features (community suburb pages, seasonal guides, editorial hubs)
 * should call `assessIndexability` instead of copying these numbers.
 *
 * A URL is indexable only when all three hold:
 * - Quantity: at least INDEX_MIN_LISTINGS live listings.
 * - Freshness: when `requireFresh` is set (undated suburb × activity pages),
 *   at least INDEX_MIN_FRESH of those listings fall inside INDEX_FRESH_DAYS.
 * - Distinct content: when `parentOverlap` is set, this page must cover less
 *   than INDEX_MAX_PARENT_OVERLAP of a broader guide. 6 of a parent's 7
 *   listings is the same page and must not be indexed.
 *
 * Empty sets are not indexable. Callers 404 those URLs. Thin, stale and
 * near-duplicate URLs can still render, with noindex and no sitemap entry.
 */
export const INDEX_MIN_LISTINGS = 5
export const INDEX_MIN_FRESH = 2
export const INDEX_FRESH_DAYS = 28
/** 6/7 ≈ 0.857 is a near-duplicate. 5/6 ≈ 0.833 still counts as its own page. */
export const INDEX_MAX_PARENT_OVERLAP = 0.85

export type IndexMode = 'primary' | 'combo' | 'seasonal' | 'editorial'

export type IndexReason = 'index' | 'empty' | 'thin' | 'stale' | 'near-duplicate'

export interface IndexabilityInput {
  total: number
  /** Listings inside the fresh window. Used only when `requireFresh` is set. */
  fresh?: number
  /**
   * Fraction of this page also covered by a broader guide (child / parent).
   * Null skips the distinct-content check. Values above 1 are treated as 1.
   */
  parentOverlap?: number | null
  /** Undated suburb × activity pages. Dated pages are fresh by their window. */
  requireFresh?: boolean
  mode?: IndexMode
}

export interface IndexabilityDecision {
  index: boolean
  reason: IndexReason
}

/**
 * True when `child` listings are too close to `parent` to be their own URL.
 * Parent must be at least as large as the child (the child is a subset).
 */
export function blocksAsNearDuplicate(child: number, parent: number): boolean {
  if (child <= 0 || parent <= 0 || parent < child) return false
  return child / parent >= INDEX_MAX_PARENT_OVERLAP
}

export function assessIndexability(input: IndexabilityInput): IndexabilityDecision {
  const total = Math.max(0, Math.floor(input.total))
  if (total <= 0) return { index: false, reason: 'empty' }
  if (total < INDEX_MIN_LISTINGS) return { index: false, reason: 'thin' }
  if (input.requireFresh && (input.fresh ?? 0) < INDEX_MIN_FRESH) return { index: false, reason: 'stale' }
  const overlap = input.parentOverlap
  if (overlap != null && Number.isFinite(overlap) && overlap >= INDEX_MAX_PARENT_OVERLAP) {
    return { index: false, reason: 'near-duplicate' }
  }
  return { index: true, reason: 'index' }
}
