/** Where a Moshtix pass resumes. Pure so the budget split can be tested without the API. */

export const MOSHTIX_LOOKBACK_MS = 6 * 60 * 60 * 1000

export type MoshtixCursor = { fromMs: number; page: number }

/** A cursor inside the lookback window resumes. Anything older starts at the floor. */
export function moshtixResume(now: number, storedFromMs: number | null, storedPage: number): MoshtixCursor {
  const floor = now - MOSHTIX_LOOKBACK_MS
  if (storedFromMs == null || !Number.isFinite(storedFromMs) || storedFromMs <= floor) return { fromMs: floor, page: 0 }
  const page = Number.isFinite(storedPage) && storedPage > 0 ? Math.floor(storedPage) : 0
  return { fromMs: storedFromMs, page }
}

/** An event later than the cursor moves the resume point. The boundary event is fetched again next run. */
export function moshtixNoteEvent(cursor: MoshtixCursor, startMs: number | null): MoshtixCursor {
  if (startMs == null || !Number.isFinite(startMs) || startMs <= cursor.fromMs) return cursor
  return { fromMs: startMs, page: 0 }
}

/**
 * A full page of one start time would otherwise be fetched again forever.
 * Ask for the next page of that time. A page that moved forward resumes from its last start.
 */
export function moshtixNotePage(before: MoshtixCursor, after: MoshtixCursor, pageStartMs: number | null, pageEndMs: number | null): MoshtixCursor {
  if (pageStartMs != null && pageEndMs != null && pageStartMs === pageEndMs) {
    return { fromMs: pageEndMs, page: before.page + 1 }
  }
  if (after.fromMs !== before.fromMs || after.page !== before.page) return after
  return { fromMs: after.fromMs, page: after.page + 1 }
}
