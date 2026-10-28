// When an OUTZA Intelligence source is due. Pure so the stale-running and resume rules can be unit-tested.
import { isOpenImport } from './abs-plan'

/** A platform kill leaves status=running. After this, cron and admin may take the source back. */
export const STALE_RUNNING_MS = 20 * 60 * 1000

/** Stop a chunked import this long before the 300s function limit, leaving room for cold start and the final status write. */
export const IMPORT_BUDGET_MS = 200_000

/** Don't start another ABS chunk when less than this remains. One chunk has to finish inside the budget. */
export const MIN_CHUNK_MS = 20_000

export const NATIONAL_COVERAGE = 'au-cities-v1'
export const NATIONAL_SOURCES = new Set(['abs_region', 'abs_seifa', 'abs_hsi'])

export const STALE_RUNNING_ERROR = `Import was still marked running after ${STALE_RUNNING_MS / 60000} minutes, so it was marked failed and can be retried. The last good dataset is still being served.`

export function asConfig(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {}
}

export function isStaleRunning(status: string, lastCheckedAt: Date | null, now = Date.now()) {
  if (status !== 'running') return false
  if (!lastCheckedAt) return true
  return now - lastCheckedAt.getTime() >= STALE_RUNNING_MS
}

export type DueSource = {
  key: string
  status: string
  lastCheckedAt: Date | null
  failCount: number
  config: unknown
  lastSuccessAt?: Date | null
}

/**
 * Weekly and monthly sources are not due just because cron fired.
 * A source left `running` past the stale window, a `partial` chunked import, or `retryNow` is due immediately.
 * A fresh `running` row is skipped so a live invocation is not started twice.
 */
export function sourceIsDue(s: DueSource, scheduleHours: number, now = Date.now()) {
  const cfg = asConfig(s.config)
  if (s.status === 'running' && !isStaleRunning(s.status, s.lastCheckedAt, now)) return false
  if (s.status === 'partial' || cfg.retryNow === true) return true
  if ((s.status === 'failed' || s.status === 'running') && isOpenImport(cfg.import)) return true
  if (isStaleRunning(s.status, s.lastCheckedAt, now)) return true
  const last = s.lastCheckedAt ? s.lastCheckedAt.getTime() : 0
  const interval = s.status === 'failed' ? Math.min(scheduleHours, s.failCount >= 3 ? 6 : 1) : scheduleHours
  const staleCoverage = NATIONAL_SOURCES.has(s.key) && cfg.coverage !== NATIONAL_COVERAGE
  // A national source that has never succeeded (region is the one still timing out) is always due.
  if (staleCoverage || (NATIONAL_SOURCES.has(s.key) && s.lastSuccessAt == null)) return true
  return now - last >= interval * 3_600_000
}

/** Chunked ABS work that has not succeeded yet runs before the daily sources, so the time budget is spent on it. */
export function sourceRunRank(s: DueSource) {
  const cfg = asConfig(s.config)
  const abs = s.key === 'abs_region' || s.key === 'abs_seifa'
  const urgent = abs && (s.status === 'partial' || s.status === 'failed' || s.status === 'running' || s.lastSuccessAt == null || cfg.retryNow === true || isOpenImport(cfg.import))
  if (urgent) return 0
  if (abs) return 2
  return 1
}

export function compareSourceRun(a: DueSource, b: DueSource) {
  return sourceRunRank(a) - sourceRunRank(b) || a.key.localeCompare(b.key)
}
