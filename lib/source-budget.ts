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
  const store: Store = { source, deadline: Date.now() + budgetMs, controller, warned: false, saved: 0 }
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
    if (e instanceof SourceBudgetExceeded || controller.signal.aborted) {
      return { value: null, timedOut: true, saved: store.saved, error: null }
    }
    return { value: null, timedOut: false, saved: store.saved, error: e instanceof Error ? e : new Error(String(e)) }
  } finally {
    clearTimeout(budgetTimer)
    clearTimeout(graceTimer)
  }
}
