/**
 * Alerts for ingestion health. An empty or shrinking feed is recorded.
 * Nothing here deletes listings.
 */
import { prisma } from '@/lib/prisma'
import { isPartialRefresh, refreshFailure, sweepFlagsFromLog } from '@/lib/refresh-plan'

export type VolumeSignal = 'zero' | 'drop' | null

/**
 * Compare this run with the previous finished run of the same source.
 * A timeout or a hard failure is not treated as a real drop.
 * A source that has never saved events (for example Ticketek with no feed configured) stays quiet.
 * Callers that resume across invocations pass sweep totals from `sourceVolumeSignal` instead of raw chunk counts.
 */
export function volumeAlert(previous: number | null, current: number, opts: { timedOut?: boolean; failed?: boolean } = {}): VolumeSignal {
  if (opts.timedOut || opts.failed) return null
  if (previous == null || previous < 20) return null
  if (current === 0) return 'zero'
  if (previous >= 40 && current < previous * 0.5) return 'drop'
  return null
}

export type SweepRun = {
  events: number
  /** This run resumed a sweep an earlier run left unfinished. */
  continuation: boolean
  /** This run stopped with more of the same sweep left. */
  more: boolean
  /** No sweep mark. An ordinary one-shot run, or a chunk saved before marks existed. */
  unmarked: boolean
  failed?: boolean
  timedOut?: boolean
}

export type SweepComparison = {
  /** False when this run is not a finished sweep, or its chunks cannot be added up. */
  comparable: boolean
  currentTotal: number
  previousTotal: number | null
  chunks: number
  previousChunks: number
}

function countsInSweep(run: SweepRun): boolean {
  if ((run.failed || run.timedOut) && !run.more && !run.continuation) return false
  return true
}

/**
 * Add up the finished sweep whose newest run is `history[tail]`.
 * History is newest first. A continuation keeps walking until the chunk that started the sweep.
 * One unmarked run immediately before that chain can be the start chunk from before marks existed.
 * Returns null when a continuation has no start we can see.
 */
function sumSweep(history: SweepRun[], tail: number): { total: number; chunks: number; next: number } | null {
  const run = history[tail]
  if (!run || run.more || run.failed || run.timedOut) return null
  let total = run.events
  let chunks = 1
  if (!run.continuation) return { total, chunks, next: tail + 1 }
  for (let i = tail + 1; i < history.length; i++) {
    const older = history[i]
    if (!countsInSweep(older)) return null
    if (!older.more && !older.continuation) {
      if (!older.unmarked) return null
      total += older.events
      chunks++
      return { total, chunks, next: i + 1 }
    }
    total += older.events
    chunks++
    if (!older.continuation) return { total, chunks, next: i + 1 }
  }
  return null
}

/**
 * Like-for-like volume for one source.
 * A resumable source (Moshtix today; any source that sets the same flags) is compared
 * only when a sweep has finished, using the sum of its chunks. An open chunk, a continuation
 * that is still going, a timeout, or a hard failure is not a drop.
 * A one-shot source uses the same threshold: this run's count against the previous successful run.
 * A timed-out or failed log is not that baseline.
 */
export function sweepComparison(historyNewestFirst: SweepRun[], current: SweepRun): SweepComparison {
  const quiet = { comparable: false, currentTotal: current.events, previousTotal: null, chunks: 1, previousChunks: 0 }
  if (current.failed || current.timedOut || current.more) return quiet
  const runs = [current, ...historyNewestFirst]
  const sweep = sumSweep(runs, 0)
  if (!sweep) return quiet
  let previousTotal: number | null = null
  let previousChunks = 0
  for (let i = sweep.next; i < runs.length; i++) {
    const older = runs[i]
    if (older.more || older.failed || older.timedOut) continue
    const prior = sumSweep(runs, i)
    if (!prior) continue
    previousTotal = prior.total
    previousChunks = prior.chunks
    break
  }
  return { comparable: true, currentTotal: sweep.total, previousTotal, chunks: sweep.chunks, previousChunks }
}

export function sourceVolumeSignal(historyNewestFirst: SweepRun[], current: SweepRun): { signal: VolumeSignal; comparison: SweepComparison } {
  const comparison = sweepComparison(historyNewestFirst, current)
  if (!comparison.comparable) return { signal: null, comparison }
  return { signal: volumeAlert(comparison.previousTotal, comparison.currentTotal), comparison }
}

/** Words for the fault email. A summed sweep says so; a one-shot run keeps the single-run wording. */
export function volumeDropDetail(name: string, signal: 'zero' | 'drop', comparison: SweepComparison): string {
  const previous = comparison.previousTotal ?? 0
  const sweep = comparison.chunks > 1 || comparison.previousChunks > 1
  if (signal === 'zero') {
    return sweep
      ? `${name} saved 0 events in a full sweep after a previous full sweep saved ${previous}. Listings already stored were not deleted.`
      : `${name} saved 0 events after a previous run saved ${previous}. Listings already stored were not deleted.`
  }
  return sweep
    ? `${name} saved ${comparison.currentTotal} events in a full sweep after a previous full sweep saved ${previous}. Listings already stored were not deleted.`
    : `${name} saved ${comparison.currentTotal} events after a previous run saved ${previous}. Listings already stored were not deleted.`
}

/** One stored source log, newest-first history for `sourceVolumeSignal`. */
export function sweepRunFromLog(events: number, errors: string | null | undefined): SweepRun {
  const flags = sweepFlagsFromLog(errors)
  const failure = refreshFailure(errors)
  return {
    events,
    continuation: flags.continuation,
    more: flags.more,
    unmarked: flags.unmarked,
    failed: !!failure && !isPartialRefresh(failure),
    timedOut: isPartialRefresh(failure),
  }
}

/** A successful response with no rows. Callers must not delete the listings they already have. */
export function emptyFeedAlert(received: number): boolean {
  return received === 0
}

/** True when parsing breaks often enough to look like a feed change, not a few bad rows. */
export function parseFailureAlert(parsed: number, failed: number): boolean {
  if (failed < 10) return false
  const total = parsed + failed
  return total > 0 && failed / total >= 0.2
}

/** Share of a quality pass that was auto-merged. Small passes stay quiet. */
export function duplicateSpikeAlert(considered: number, merged: number): boolean {
  if (considered < 200 || merged < 0) return false
  return merged / considered >= 0.25
}

/** Most rows had no venue name from the source. */
export function venueGapAlert(withVenue: number, total: number): boolean {
  if (total < 30) return false
  return withVenue / total < 0.5
}

/** An empty source never retires listings that are already stored. */
export function retireOnEmpty(_received: number): false {
  return false
}

export type QualityAlertKind = 'ZERO_EVENTS' | 'VOLUME_DROP' | 'DUPLICATE_SPIKE' | 'PARSE_FAILURES' | 'VENUE_GAP' | 'STALE_LISTINGS'

function missingRelation(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  return code === 'P2021' || code === 'P2022'
}

/** Store the alert and reuse the existing owner-fault email. Never throws. Never deletes events. */
export async function recordQualityAlert(input: { kind: QualityAlertKind; source: string; detail: string }) {
  try {
    await prisma.dataQualityAlert.create({
      data: { kind: input.kind, source: input.source.slice(0, 80), detail: input.detail.slice(0, 2000) },
    })
  } catch (err) {
    if (!missingRelation(err)) console.error('[quality-alert] store failed', (err as { message?: string })?.message)
  }
  try {
    const { reportFault } = await import('@/lib/owner-alerts')
    await reportFault({
      area: 'Event data quality',
      key: `quality-${input.kind}-${input.source}`,
      route: '/admin/sources',
      title: `${input.source}: ${input.kind.toLowerCase().replace(/_/g, ' ')}`,
      detail: input.detail,
    })
  } catch (err) {
    console.error('[quality-alert] fault report failed', (err as { message?: string })?.message)
  }
}
