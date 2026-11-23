// Wall-clock budget for one VibePeep Intelligence invocation.
// The cron route stops work IMPORT_BUDGET_MS after it starts, which is 60s before maxDuration.
import { AsyncLocalStorage } from 'node:async_hooks'

const als = new AsyncLocalStorage<number>()

export class BudgetStop extends Error {
  constructor() {
    super('Import time budget reached')
    this.name = 'BudgetStop'
  }
}

export function isBudgetStop(err: unknown) {
  return err instanceof BudgetStop || (err instanceof Error && err.name === 'BudgetStop')
}

export function intelDeadline() {
  return als.getStore()
}

export function withIntelDeadline<T>(deadline: number, fn: () => Promise<T>) {
  return als.run(deadline, fn)
}

export function budgetReached(now = Date.now(), deadline = intelDeadline()) {
  return deadline != null && now >= deadline
}

/** Per-request timeout, never longer than the time left before the import deadline. */
export function fetchBudgetMs(timeoutMs: number, now = Date.now(), deadline = intelDeadline()) {
  if (deadline == null) return timeoutMs
  return Math.max(0, Math.min(timeoutMs, deadline - now))
}

export function isAbortError(err: unknown) {
  if (!err || typeof err !== 'object') return false
  const name = 'name' in err ? String((err as { name?: unknown }).name) : ''
  if (name === 'AbortError' || name === 'TimeoutError' || name === 'BudgetStop') return true
  return err instanceof Error && /operation was aborted|the operation was aborted/i.test(err.message)
}
