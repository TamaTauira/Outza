import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Per-source time budget for listings refresh.
 * Fetches take a signal that aborts at the earlier of their own timeout and this budget.
 * A source that ignores the signal is abandoned after a short grace period so the
 * invocation can still write its log before the 300s function limit.
 */
export class SourceBudgetExceeded extends Error {
  constructor(readonly source: string) {
    super(`${source}: time budget reached; remaining work skipped`)
    this.name = 'SourceBudgetExceeded'
  }
}

type Store = {
  source: string
  deadline: number
  controller: AbortController
  warned: boolean
  saved: number
  /** A timed-out geocode gives up for the rest of this source run. */
  geocodePaused: boolean
  /** A timed-out listing-page fetch gives up for the rest of this source run. */
  pageFetchPaused: boolean
}

const als = new AsyncLocalStorage<Store>()

export function remainingBudgetMs(requested: number): number {
  const store = als.getStore()
  if (!store) return requested
  return Math.max(0, Math.min(requested, store.deadline - Date.now()))
}

export function sourceOverBudget(): boolean {
  const store = als.getStore()
  return !!store && (store.controller.signal.aborted || Date.now() >= store.deadline)
}

export function hasSourceBudget(): boolean {
  return !!als.getStore()
}

/** Geocoding should not start: the budget is over, too little time is left, or a lookup already timed out. */
export function sourceGeocodeBlocked(): boolean {
  const store = als.getStore()
  if (!store) return false
  return store.geocodePaused || sourceOverBudget() || remainingBudgetMs(2_500) < 800
}

export function pauseSourceGeocode() {
  const store = als.getStore()
  if (store) store.geocodePaused = true
}

export function sourcePageFetchBlocked(): boolean {
  const store = als.getStore()
  if (!store) return false
  return store.pageFetchPaused || sourceOverBudget() || remainingBudgetMs(4_000) < 1_500
}

export function pauseSourcePageFetch() {
  const store = als.getStore()
  if (store) store.pageFetchPaused = true
}

/** AbortError from a budget signal, or TimeoutError from AbortSignal.timeout. */
export function isAbortLike(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const name = 'name' in err ? String((err as { name?: unknown }).name) : ''
  if (name === 'AbortError' || name === 'TimeoutError') return true
  return err instanceof Error && /operation was aborted/i.test(err.message)
}

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}

/**
 * A budget abort that already saved events is a partial run, not a hard failure.
 * Genuine errors stay hard failures. An abort that saved nothing stays one too,
 * unless the budget signal itself fired (the source was abandoned on schedule).
 */
export function settleBudgetError(opts: {
  error: unknown
  signalAborted: boolean
  pastDeadline: boolean
  saved: number
}): { timedOut: boolean; error: Error | null } {
  if (opts.error instanceof SourceBudgetExceeded || opts.signalAborted) {
    return { timedOut: true, error: null }
  }
  if (opts.pastDeadline && isAbortLike(opts.error) && opts.saved > 0) {
    return { timedOut: true, error: null }
  }
  return { timedOut: false, error: asError(opts.error) }
}

/** True once when this source should stop. Logs a single warning. */
export function yieldIfBudget(label: string): boolean {
  if (!sourceOverBudget()) return false
  const store = als.getStore()
  if (store && !store.warned) {
    store.warned = true
    console.warn(`[refresh] ${store.source} hit its time budget during ${label}; skipping the rest`)
  }
  return true
}

/** Latest save count, so a hard timeout can still report how far the source got. */
export function noteSourceSaved(n: number) {
  const store = als.getStore()
  if (store) store.saved = n
}

/** Fetch timeout capped by the active source budget. Outside a budget this is AbortSignal.timeout. */
export function sourceFetchSignal(timeoutMs: number): AbortSignal {
  const store = als.getStore()
  const ms = Math.max(1, store ? Math.min(timeoutMs, store.deadline - Date.now()) : timeoutMs)
  const timed = AbortSignal.timeout(ms)
  if (!store) return timed
  if (store.controller.signal.aborted) return store.controller.signal
  if (timed.aborted) return timed
  const controller = new AbortController()
  const onAbort = () => {
    if (!controller.signal.aborted) controller.abort()
  }
  store.controller.signal.addEventListener('abort', onAbort, { once: true })
  timed.addEventListener('abort', onAbort, { once: true })
  return controller.signal
}

export type BudgetRun<T> = {
  value: T | null
  timedOut: boolean
  saved: number
  error: Error | null
}

export async function runWithSourceBudget<T>(
  source: string,
  budgetMs: number,
  fn: () => Promise<T>,
  graceMs = 2_000,
): Promise<BudgetRun<T>> {
  const controller = new AbortController()
  const deadline = Date.now() + budgetMs
  const store: Store = { source, deadline, controller, warned: false, saved: 0, geocodePaused: false, pageFetchPaused: false }
  const budgetTimer = setTimeout(() => controller.abort(), budgetMs)
  let graceTimer: ReturnType<typeof setTimeout> | undefined
  const grace = new Promise<never>((_, reject) => {
    graceTimer = setTimeout(() => reject(new SourceBudgetExceeded(source)), budgetMs + graceMs)
  })
  try {
    const value = await als.run(store, () => Promise.race([fn(), grace]))
    const timedOut = controller.signal.aborted || Date.now() >= store.deadline
    return { value, timedOut, saved: typeof value === 'number' ? value : store.saved, error: null }
  } catch (e) {
    const settled = settleBudgetError({
      error: e,
      signalAborted: controller.signal.aborted,
      pastDeadline: Date.now() >= store.deadline - 1_000,
      saved: store.saved,
    })
    return { value: null, timedOut: settled.timedOut, saved: store.saved, error: settled.error }
  } finally {
    clearTimeout(budgetTimer)
    clearTimeout(graceTimer)
  }
}
