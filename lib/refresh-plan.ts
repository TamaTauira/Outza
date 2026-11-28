/**
 * Listings refresh is split so no invocation approaches the 300s function limit.
 * Source chunks run every hour, two minutes apart. Finalize is minute 23 so
 * Popular regulars (minute 18) and Brisbane City Council (minute 20) each finish
 * their own invocation before the cycle is assessed. A slow regulars run must
 * not delay the council feed past that assessment.
 * The listings burst ends at minute 23. Finalize can keep writing for 150s,
 * so minute 24 is still inside that write. Price lookup is not one of these
 * chunks. It runs at minute 31, after that budget, and still leaves 30 minutes
 * idle so Neon can suspend before the next hour.
 * Events are still refreshed at least once an hour.
 * Budgets stay at or under 220s so the log write still fits.
 */
import { isMoshtixPause } from '@/lib/moshtix-refresh'

export const REFRESH_CYCLE_WINDOW_MS = 40 * 60 * 1000
/**
 * Other hourly jobs that stay inside the same awake window as the listings burst.
 * 22 is sponsorships, 24 is owner alerts, 31 is price lookup (after finalize).
 */
export const HOURLY_SIDE_MINUTES = [22, 24, 31] as const
/** Stop starting another source once an HTTP invocation has been running this long. */
export const REFRESH_INVOCATION_BUDGET_MS = 240_000
/** Headroom under the 300s limit for the status write. */
export const SOURCE_BUDGET_MAX_MS = 220_000
/**
 * Post-steps on the finalize invocation. The cycle row is written before either
 * of them. Together they stay well under the 300s function limit: a slow quality
 * pass must not be what keeps the cycle from being recorded.
 */
export const QUALITY_PASS_BUDGET_MS = 70_000
export const LOCAL_IMPORT_BUDGET_MS = 40_000
/** Wall clock shared by both post-steps, including the gap before the response. */
export const FINALIZE_POST_BUDGET_MS = 150_000
const POST_STEP_TAIL_MS = 5_000

/**
 * The suburb-totals warm that ends finalize, after the public-listings
 * invalidation drops the cached fills. The finalize steps before it
 * can already draw ~205s of the 300s function limit in the worst case
 * (the 150s post-step wall, retirement's 30s, the image pass's 25s),
 * so the warm takes what is left with margin for the cycle assessment
 * and the log writes — and in practice the earlier steps rarely take
 * their full budgets, so the warm usually has its whole minute.
 */
export const TOTALS_WARM_BUDGET_MS = 60_000
/**
 * One city's share of the warm. Sydney's totals scan is the only one
 * near the edge (dozens of chunks); the other cities are a handful of
 * chunks each. A city whose chunk loses its statement race fails in
 * about that race's budget (25s in the warm), well inside this cap —
 * the cap binds only a scan whose chunks all succeed slowly.
 */
export const TOTALS_WARM_CITY_BUDGET_MS = 45_000

/**
 * Budget for one finalize post-step, or null when starting it would run past
 * the finalize ceiling. Quality keeps the local-import budget in reserve.
 */
export function postStepBudget(elapsedMs: number, step: 'quality' | 'local'): number | null {
  const left = FINALIZE_POST_BUDGET_MS - elapsedMs
  if (step === 'quality') {
    const reserve = LOCAL_IMPORT_BUDGET_MS + POST_STEP_TAIL_MS
    if (left <= reserve) return null
    return Math.min(QUALITY_PASS_BUDGET_MS, left - reserve)
  }
  if (left <= POST_STEP_TAIL_MS) return null
  return Math.min(LOCAL_IMPORT_BUDGET_MS, left - POST_STEP_TAIL_MS)
}

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
  { id: 'popular-regulars', minute: 18, budgetMs: 100_000, sources: ['Popular regulars'] },
  { id: 'brisbane', minute: 20, budgetMs: 100_000, sources: ['Brisbane City Council'] },
  { id: 'finalize', minute: 23, budgetMs: FINALIZE_POST_BUDGET_MS, finalize: true },
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

export type SweepProgress = { continuation: boolean; more: boolean; sweepId: string | null }

const SWEEP_MARK = /\[sweep:(continued\+more|continued|more)(?:\s+id=([a-z0-9]+))?\]/i

function cleanSweepId(id: string | null | undefined): string | null {
  if (!id || !/^[a-z0-9]+$/i.test(id)) return null
  return id.toLowerCase()
}

/** Remember that a run resumed a sweep, or stopped with more of it left. Not a failure. */
export function sweepToken(flags: { continuation?: boolean; more?: boolean; sweepId?: string | null }): string | null {
  const body = flags.continuation && flags.more ? 'continued+more' : flags.continuation ? 'continued' : flags.more ? 'more' : null
  if (!body) return null
  const id = cleanSweepId(flags.sweepId)
  return id ? `[sweep:${body} id=${id}]` : `[sweep:${body}]`
}

/** Attach a sweep mark to a log error. A chunk with no real error is stored as the mark alone. */
export function withSweepMark(error: string | null, flags: { continuation?: boolean; more?: boolean; sweepId?: string | null }): string | null {
  const mark = sweepToken(flags)
  if (!mark) return error
  if (!error) return mark
  if (SWEEP_MARK.test(error)) return error
  return `${error} ${mark}`
}

export function readSweepMark(error: string | null | undefined): SweepProgress & { marked: boolean } {
  const match = error?.match(SWEEP_MARK)
  if (!match) return { continuation: false, more: false, sweepId: null, marked: false }
  const sweepId = cleanSweepId(match[2])
  const kind = match[1].toLowerCase()
  if (kind === 'continued+more') return { continuation: true, more: true, sweepId, marked: true }
  if (kind === 'continued') return { continuation: true, more: false, sweepId, marked: true }
  return { continuation: false, more: true, sweepId, marked: true }
}

/** Failure text with the sweep mark removed. Null when the log is only sweep progress. */
export function refreshFailure(errors: string | null | undefined): string | null {
  if (!errors) return null
  const stripped = errors.replace(SWEEP_MARK, '').replace(/\s+/g, ' ').trim()
  return stripped || null
}

/**
 * Flags stored on a finished source log.
 * A Moshtix pause already says the next run continues, so it counts as an open chunk
 * even when it was written before sweep marks existed.
 * A log with no mark and no pause is unmarked: an ordinary one-shot run, or a legacy chunk.
 */
export function sweepFlagsFromLog(errors: string | null | undefined): SweepProgress & { unmarked: boolean } {
  const mark = readSweepMark(errors)
  const pause = isMoshtixPause(errors)
  if (mark.marked || pause) {
    return { continuation: mark.continuation, more: mark.more || pause, sweepId: mark.sweepId, unmarked: false }
  }
  return { continuation: false, more: false, sweepId: null, unmarked: true }
}

/** Keep sweep progress on a thrown error so the refresh log can record the chunk. */
export function attachSweepProgress(err: unknown, progress: { continuation: boolean; more: boolean; sweepId?: string | null }): Error {
  const error = err instanceof Error ? err : new Error(String(err))
  ;(error as Error & { sweepProgress?: SweepProgress }).sweepProgress = {
    continuation: progress.continuation === true,
    more: progress.more === true,
    sweepId: cleanSweepId(progress.sweepId),
  }
  return error
}

export function readSweepProgress(err: unknown): SweepProgress | null {
  if (!err || typeof err !== 'object' || !('sweepProgress' in err)) return null
  const progress = (err as { sweepProgress?: Partial<SweepProgress> }).sweepProgress
  if (!progress) return null
  return {
    continuation: progress.continuation === true,
    more: progress.more === true,
    sweepId: cleanSweepId(progress.sweepId),
  }
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
    const failure = refreshFailure(row.errors)
    if (!failure) continue
    if (isPartialRefresh(failure)) warned.push(name)
    else failed.push(name)
  }
  const allHardFailed = sourceNames.length > 0 && failed.length === sourceNames.length
  return { ok: missing.length === 0 && !allHardFailed, missing, failed, warned, eventsAdded }
}
