/**
 * Listings refresh is split so no invocation approaches the 300s function limit.
 * Chunks run every hour, two minutes apart, then the short housekeeping jobs.
 * The burst ends by minute 24. The rest of the hour is idle so Neon compute can
 * suspend (the default idle timeout is 5 minutes) before the next hour.
 * Events are still refreshed at least once an hour.
 * Budgets stay at or under 220s so the log write still fits.
 */
import { isMoshtixPause } from '@/lib/moshtix-refresh'

export const REFRESH_CYCLE_WINDOW_MS = 40 * 60 * 1000
/** Housekeeping that shares the refresh burst instead of waking the database on its own. */
export const HOURLY_SIDE_MINUTES = [22, 24] as const
/** Stop starting another source once an HTTP invocation has been running this long. */
export const REFRESH_INVOCATION_BUDGET_MS = 240_000
/** Headroom under the 300s limit for the status write. */
export const SOURCE_BUDGET_MAX_MS = 220_000

export type RefreshChunk = {
  id: string
  /** Minute past the hour. Cron runs this chunk every hour at that minute. */
  minute: number
  budgetMs: number
  sources?: string[]
  finalize?: boolean
}

export const REFRESH_CHUNKS: RefreshChunk[] = [
  { id: 'ticketmaster', minute: 2, budgetMs: 200_000, sources: ['Ticketmaster'] },
  { id: 'frontier', minute: 4, budgetMs: 70_000, sources: ['Frontier Touring'] },
  { id: 'city-of-sydney', minute: 6, budgetMs: SOURCE_BUDGET_MAX_MS, sources: ['City of Sydney'] },
  { id: 'humanitix', minute: 8, budgetMs: 90_000, sources: ['Humanitix'] },
  { id: 'moshtix', minute: 10, budgetMs: SOURCE_BUDGET_MAX_MS, sources: ['Moshtix'] },
  { id: 'oztix', minute: 12, budgetMs: SOURCE_BUDGET_MAX_MS, sources: ['Oztix'] },
  { id: 'ticketek', minute: 14, budgetMs: 160_000, sources: ['Ticketek'] },
  { id: 'eventbrite', minute: 16, budgetMs: SOURCE_BUDGET_MAX_MS, sources: ['Eventbrite'] },
  { id: 'curated', minute: 18, budgetMs: 100_000, sources: ['Popular regulars', 'Brisbane City Council'] },
  { id: 'finalize', minute: 20, budgetMs: 200_000, finalize: true },
]

/** Minutes from the end of the burst until the next hour's first chunk. */
export function burstIdleMinutes(activityMinutes: number[], nextStart: number): number {
  const last = Math.max(...activityMinutes)
  return nextStart + 60 - (last + 1)
}

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

/**
 * A partial refresh. The time budget ran out, or Moshtix paused after a transient
 * upstream error once it had already saved events. Not a fault by itself.
 */
export function isPartialRefresh(error: string | null | undefined) {
  return isBudgetSkip(error) || isMoshtixPause(error)
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
 * One hard failure, or a source that stopped early after saving events, still counts:
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
    if (isPartialRefresh(row.errors)) warned.push(name)
    else failed.push(name)
  }
  const allHardFailed = sourceNames.length > 0 && failed.length === sourceNames.length
  return { ok: missing.length === 0 && !allHardFailed, missing, failed, warned, eventsAdded }
}
