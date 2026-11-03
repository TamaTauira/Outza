/** Freshness rules for listings. A quiet or failed source is not a cancellation. */

export const STALE_AFTER_DAYS = 14

export function sourceOutageSentence(): string {
  return 'Nothing was cancelled or deleted. A source that is temporarily unavailable is not treated as a cancellation.'
}

/** Share of upcoming listings that have not been re-checked. Small catalogues stay quiet. */
export function staleShareAlert(upcoming: number, stale: number): boolean {
  if (upcoming < 80 || stale < 0) return false
  return stale / upcoming >= 0.45
}

export function staleAlertDetail(stale: number, upcoming: number): string {
  return `${stale} of ${upcoming} upcoming scheduled listings have not been re-checked in ${STALE_AFTER_DAYS} days. ${sourceOutageSentence()}`
}

/**
 * A reported status is applied only when the source row was actually read
 * and, for a cancellation, the report is confident. An outage keeps the current status.
 */
export function statusAfterSourceReport(input: {
  current: string
  sourceMissing: boolean
  reportedStatus: string | null
  confidence: number
}): { status: string; applied: boolean; reason: string } {
  if (input.sourceMissing || !input.reportedStatus) {
    return { status: input.current, applied: false, reason: 'source-unavailable' }
  }
  if (input.reportedStatus === 'CANCELLED' && input.confidence < 0.8) {
    return { status: input.current, applied: false, reason: 'low-confidence' }
  }
  return { status: input.reportedStatus, applied: true, reason: 'source-reported' }
}

export function reportedStatusNote(status: string | null | undefined, sourceLabel: string | null): string | null {
  if (!status || status === 'SCHEDULED') return null
  const who = sourceLabel || 'a source'
  const name = status.toLowerCase().replace(/_/g, ' ')
  return `The “${name}” status is shown because ${who} reported it. ${sourceOutageSentence()}`
}
