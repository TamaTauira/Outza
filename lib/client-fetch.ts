/**
 * Same-origin reads from the browser. A dropped connection resolves as
 * `network` instead of rejecting, so a blip cannot become an unhandled
 * rejection or an error-boundary crash.
 */

export type FetchOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'abort' }
  | { ok: false; reason: 'network' }
  | { ok: false; reason: 'http'; status: number }
  | { ok: false; reason: 'bad-json'; status: number }

export function isAbortError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { name?: string }).name === 'AbortError'
}

export async function readJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<FetchOutcome<T>> {
  try {
    const res = await fetch(input, init)
    if (!res.ok) return { ok: false, reason: 'http', status: res.status }
    try {
      return { ok: true, data: (await res.json()) as T }
    } catch {
      return { ok: false, reason: 'bad-json', status: res.status }
    }
  } catch (error) {
    if (isAbortError(error)) return { ok: false, reason: 'abort' }
    return { ok: false, reason: 'network' }
  }
}

/**
 * Keep the last good value when the network drops. HTTP and JSON failures
 * also keep it: an error page must not wipe the list. Abort leaves state alone.
 */
export function keepLastGood<T>(previous: T, outcome: FetchOutcome<T>): { data: T; offline: boolean; replace: boolean } {
  if (outcome.ok) return { data: outcome.data, offline: false, replace: true }
  if (outcome.reason === 'network') return { data: previous, offline: true, replace: false }
  return { data: previous, offline: false, replace: false }
}

/**
 * Runs `retry` once, on the next `online` or when the tab becomes visible
 * again. `ready` can defer that one shot until there is something to retry.
 */
export type ReconnectRetry = { retried: boolean; stop: () => void }

export function createReconnectRetry(): ReconnectRetry {
  return { retried: false, stop: () => {} }
}

/** Arms a single reconnect/visibility retry. Later failures do not arm another. */
export function armReconnect(retry: ReconnectRetry, run: () => void) {
  if (retry.retried) return
  retry.retried = true
  retry.stop()
  retry.stop = listenForOneReconnect(run)
}

export function listenForOneReconnect(retry: () => void, ready: () => boolean = () => true): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}
  let used = false
  const kick = () => {
    if (used || !ready()) return
    if (document.visibilityState === 'hidden') return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    used = true
    retry()
  }
  window.addEventListener('online', kick)
  document.addEventListener('visibilitychange', kick)
  return () => {
    window.removeEventListener('online', kick)
    document.removeEventListener('visibilitychange', kick)
  }
}
