/**
 * Listings refresh is split so no invocation approaches the 300s function limit.
 * Pro cron jobs are per-minute (this app already schedules every 2 hours, which Hobby rejects)
 * and a project may have 100 crons. Each chunk is its own cron with maxDuration 300.
 * Budgets stay at or under 220s so the log write still fits, and chunk minutes stay
 * off :00, :15, :30 and :45 where the other jobs run.
 */
export const REFRESH_CYCLE_WINDOW_MS = 90 * 60 * 1000
/** Stop starting another source once an HTTP invocation has been running this long. */
export const REFRESH_INVOCATION_BUDGET_MS = 240_000
/** Headroom under the 300s limit for the status write. */
export const SOURCE_BUDGET_MAX_MS = 220_000

export type RefreshChunk = {
  id: string
  /** Minute past the hour. Cron runs this chunk every 2 hours at that minute. */
  minute: number
  budgetMs: number
  sources?: string[]
  finalize?: boolean
}

export const REFRESH_CHUNKS: RefreshChunk[] = [
  { id: 'ticketmaster', minute: 2, budgetMs: 200_000, sources: ['Ticketmaster'] },
  { id: 'frontier', minute: 8, budgetMs: 70_000, sources: ['Frontier Touring'] },
  { id: 'city-of-sydney', minute: 14, budgetMs: SOURCE_BUDGET_MAX_MS, sources: ['City of Sydney'] },
  { id: 'humanitix', minute: 20, budgetMs: 90_000, sources: ['Humanitix'] },
  { id: 'moshtix', minute: 26, budgetMs: 180_000, sources: ['Moshtix'] },
  { id: 'oztix', minute: 32, budgetMs: SOURCE_BUDGET_MAX_MS, sources: ['Oztix'] },
  { id: 'ticketek', minute: 38, budgetMs: 160_000, sources: ['Ticketek'] },
  { id: 'eventbrite', minute: 44, budgetMs: SOURCE_BUDGET_MAX_MS, sources: ['Eventbrite'] },
  { id: 'curated', minute: 50, budgetMs: 90_000, sources: ['Popular regulars'] },
  { id: 'finalize', minute: 56, budgetMs: 200_000, finalize: true },
]

export function chunkById(id: string): RefreshChunk | null {
  return REFRESH_CHUNKS.find((c) => c.id === id) ?? null
}

export function sourceLogStatus(name: string) {
  return `source:${name}`
}

/** A source that stopped early still saved what it had. That is not a hard failure. */
export function isBudgetSkip(error: string | null | undefined) {
  return !!error && /time budget/i.test(error)
}

export type CycleLog = {
  status: string
  endedAt: Date | null
  errors: string | null
  eventsAdded: number
  startedAt: Date
}

export type CycleAssessment = {
  /** Every chunk finished, and at least one source did not hard-fail. */
  ok: boolean
  missing: string[]
  failed: string[]
  warned: string[]
  eventsAdded: number
}

/**
 * Overall success means every source chunk finished this cycle.
 * One hard failure, or a source that stopped at its time budget, still counts:
 * the run completed. A chunk that never reported does not.
 */
export function assessRefreshCycle(logs: CycleLog[], sourceNames: string[]): CycleAssessment {
  const missing: string[] = []
  const failed: string[] = []
  const warned: string[] = []
  let eventsAdded = 0
  for (const name of sourceNames) {
    const row = logs
      .filter((l) => l.status === sourceLogStatus(name) && l.endedAt)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0]
    if (!row) {
      missing.push(name)
      continue
    }
    eventsAdded += row.eventsAdded ?? 0
    if (!row.errors) continue
    if (isBudgetSkip(row.errors)) warned.push(name)
    else failed.push(name)
  }
  const allHardFailed = sourceNames.length > 0 && failed.length === sourceNames.length
  return { ok: missing.length === 0 && !allHardFailed, missing, failed, warned, eventsAdded }
}
