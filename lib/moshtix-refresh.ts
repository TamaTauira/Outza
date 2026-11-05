/** Where a Moshtix pass resumes. Pure so the budget split can be tested without the API. */

export const MOSHTIX_LOOKBACK_MS = 6 * 60 * 60 * 1000

/**
 * 50 events comes back in about 5 seconds. 200 events is about 22 seconds and
 * about 600KB, which is long enough for the Moshtix gateway to return 504.
 */
export const MOSHTIX_PAGE_SIZE = 50
/** A second timeout tries a smaller page. The page index is not comparable across sizes. */
export const MOSHTIX_SMALL_PAGE_SIZE = 25
/** First request plus two retries. */
export const MOSHTIX_MAX_ATTEMPTS = 3
export const MOSHTIX_RETRY_BASE_MS = 1_000
/** Don't start a retry that cannot finish a normal page before the budget ends. */
export const MOSHTIX_RETRY_BUDGET_MS = 12_000

export type MoshtixCursor = { fromMs: number; page: number }

/** Page size to request. An unknown or retired size starts at the normal page. */
export function moshtixResumePageSize(storedPageSize: number | null | undefined): number {
  return storedPageSize === MOSHTIX_SMALL_PAGE_SIZE ? MOSHTIX_SMALL_PAGE_SIZE : MOSHTIX_PAGE_SIZE
}

/**
 * A cursor inside the lookback window resumes.
 * Anything older starts at the floor.
 * A page index is only kept when it was saved at the page size this run will use.
 * A legacy cursor (no stored size) or a size change starts again at page 0 of the same instant,
 * so events are fetched again instead of skipped.
 */
export function moshtixResume(
  now: number,
  storedFromMs: number | null,
  storedPage: number,
  storedPageSize?: number | null,
): MoshtixCursor {
  const floor = now - MOSHTIX_LOOKBACK_MS
  if (storedFromMs == null || !Number.isFinite(storedFromMs) || storedFromMs <= floor) return { fromMs: floor, page: 0 }
  const useSize = moshtixResumePageSize(storedPageSize)
  const pageValid = storedPageSize == null || storedPageSize === useSize
  const page = pageValid && Number.isFinite(storedPage) && storedPage > 0 ? Math.floor(storedPage) : 0
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

export function moshtixApiStatus(err: unknown): number | null {
  if (!(err instanceof Error)) return null
  const match = /^Moshtix API (\d{3})$/.exec(err.message)
  return match ? Number(match[1]) : null
}

function failureText(err: unknown): string {
  if (!(err instanceof Error)) return ''
  const cause = (err as { cause?: unknown }).cause
  let extra = ''
  if (cause instanceof Error) extra = `${cause.name} ${cause.message}`
  else if (typeof cause === 'string') extra = cause
  else if (cause && typeof cause === 'object' && 'code' in cause) extra = String((cause as { code?: unknown }).code ?? '')
  return `${err.name} ${err.message} ${extra}`
}

/** 502, 503, 504, 408, a client timeout, or a dropped connection. 4xx and other 5xx stay hard errors. */
export function moshtixTransientFailure(err: unknown): boolean {
  const status = moshtixApiStatus(err)
  if (status != null) return status === 408 || status === 502 || status === 503 || status === 504
  const text = failureText(err)
  if (/\bAbortError\b/.test(text) || /\bTimeoutError\b/.test(text) || /operation was aborted/i.test(text)) return true
  return /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|UND_ERR_|socket hang up|ECONNREFUSED/i.test(text)
}

export function moshtixFailureReason(err: unknown): string {
  const status = moshtixApiStatus(err)
  if (status != null) return String(status)
  const text = failureText(err)
  if (/\bAbortError\b/.test(text) || /\bTimeoutError\b/.test(text) || /operation was aborted/i.test(text)) return 'timeout'
  return 'network'
}

/** Logged as a refresh error, and recognised as a partial run rather than a fault. */
export function moshtixPauseMessage(saved: number, reason: string) {
  return `upstream ${reason} after saving ${saved} events; continuing next run`
}

export function isMoshtixPause(error: string | null | undefined) {
  return !!error && /upstream (?:408|502|503|504|timeout|network) after saving \d+ events; continuing next run/i.test(error)
}

export type MoshtixRetryInput = {
  /** Failures so far for this page, including the one just caught. */
  failures: number
  pageSize: number
  page: number
  saved: number
  progressed: boolean
  transient: boolean
  nearBudget: boolean
  remainingMs: number
}

export type MoshtixRetryDecision =
  | { action: 'retry'; delayMs: number; pageSize: number; page: number }
  | { action: 'pause' }
  | { action: 'fail' }

/**
 * Retry a transient error with backoff while the budget can still fit another page.
 * The second failure uses the smaller page and starts again at page 0 of the same instant.
 * After the retries, a run that already moved forward pauses. A run that got nowhere fails.
 */
export function moshtixRetryDecision(input: MoshtixRetryInput): MoshtixRetryDecision {
  if (!input.transient) return { action: 'fail' }
  const delayMs = MOSHTIX_RETRY_BASE_MS * 2 ** Math.max(0, input.failures - 1)
  const room = !input.nearBudget && input.remainingMs >= delayMs + MOSHTIX_RETRY_BUDGET_MS
  if (input.failures < MOSHTIX_MAX_ATTEMPTS && room) {
    const shrink = input.failures >= 2 && input.pageSize > MOSHTIX_SMALL_PAGE_SIZE
    return {
      action: 'retry',
      delayMs,
      pageSize: shrink ? MOSHTIX_SMALL_PAGE_SIZE : input.pageSize,
      page: shrink ? 0 : input.page,
    }
  }
  if (input.progressed || input.saved > 0) return { action: 'pause' }
  return { action: 'fail' }
}
