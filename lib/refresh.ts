import { prisma, runWithJobPrisma } from '@/lib/prisma'
import { runRetirementPass, RETIREMENT_PASS_BUDGET_MS } from '@/lib/retirement'
import { fetchTicketmasterEvents } from '@/lib/ticketmaster'
import { fetchEventbriteEvents } from '@/lib/sources/eventbrite'
import { fetchFrontierEvents, fetchCityOfSydneyEvents, fetchHumanitixEvents } from '@/lib/sources/promoters'
import { runQualityPass } from '@/lib/quality-pass'
import { fetchCuratedEvents } from '@/lib/sources/curated'
import { fetchBrisbaneCouncilEvents } from '@/lib/sources/brisbane-council'
import { recordQualityAlert, retireVolumeFault, sourceVolumeSignal, sweepRunFromLog, volumeDropDetail } from '@/lib/source-health'
import { runImagePass } from '@/lib/images/runner'
import { importLocalFromBoard } from '@/lib/local-import'
import { fetchMoshtixEvents, fetchOztixEvents, fetchTicketekEvents } from '@/lib/sources/ticketing'
import { runWithSourceBudget } from '@/lib/source-budget'
import {
  REFRESH_CHUNKS,
  REFRESH_CYCLE_WINDOW_MS,
  REFRESH_INVOCATION_BUDGET_MS,
  SOURCE_BUDGET_MAX_MS,
  assessRefreshCycle,
  postStepBudget,
  chunkById,
  isPartialRefresh,
  readSweepProgress,
  refreshFailure,
  sourceLogStatus,
  withSweepMark,
} from '@/lib/refresh-plan'

/** A listings fetch. A resumable source returns sweep flags; every other source returns a count. */
export type SourceFetchResult = { saved: number; continuation?: boolean; more?: boolean; sweepId?: string | null }

const SOURCES: [string, () => Promise<number | SourceFetchResult>][] = [
  ['Ticketmaster', fetchTicketmasterEvents],
  ['Frontier Touring', fetchFrontierEvents],
  ['City of Sydney', fetchCityOfSydneyEvents],
  ['Humanitix', fetchHumanitixEvents],
  ['Moshtix', fetchMoshtixEvents],
  ['Oztix', fetchOztixEvents],
  ['Ticketek', fetchTicketekEvents],
  ['Eventbrite', fetchEventbriteEvents],
  ['Popular regulars', fetchCuratedEvents],
  ['Brisbane City Council', fetchBrisbaneCouncilEvents],
]

/** Display names in run order. Match is case-insensitive. */
export const SOURCE_NAMES = SOURCES.map(([name]) => name)

export { REFRESH_CHUNKS, chunkById, assessRefreshCycle }

export type RefreshResult = {
  eventsAdded: number
  errors: string[]
  sourcesRun: string[]
  /** Set on the finalize chunk. True when every source chunk finished. */
  cycleOk?: boolean
}

export type RefreshSourcesOptions = {
  /** Display names to run. Omit for every source, unless `finalize` is set with no names (post-steps only). */
  sources?: string[]
  /** Run the quality pass and local import, then record the cycle outcome. */
  finalize?: boolean
  /** Write one finished log per source. The cycle log is only written by finalize. */
  chunk?: boolean
  /** Do not start another source after this much wall time. HTTP routes set this. */
  invocationBudgetMs?: number
}

const inflight = new Map<string, Promise<RefreshResult>>()

function normalise(name: string) {
  return name.trim().toLowerCase()
}

function budgetFor(name: string) {
  return REFRESH_CHUNKS.find((c) => c.sources?.includes(name))?.budgetMs ?? SOURCE_BUDGET_MAX_MS
}

function assertChunksCoverSources() {
  const listed = REFRESH_CHUNKS.flatMap((c) => c.sources ?? [])
  const missing = SOURCE_NAMES.filter((n) => !listed.includes(n))
  const extra = listed.filter((n) => !SOURCE_NAMES.includes(n))
  if (missing.length || extra.length || listed.length !== SOURCE_NAMES.length) {
    throw new Error(`Refresh chunks drifted from sources. missing=${missing.join(',')} extra=${extra.join(',')}`)
  }
}

/**
 * Run named sources, or every source when no filter is given.
 * A `finalize` call with no source filter runs the quality pass, local import, and the cycle log.
 * Identical in-flight work in this process is shared. Different chunks are not.
 * The run uses the job Prisma client so event-page reads keep the interactive pool.
 */
export function refreshSources(opts: RefreshSourcesOptions = {}): Promise<RefreshResult> {
  const key = `${opts.chunk ? 'chunk' : 'full'}|${opts.finalize ? 'fin' : ''}|${(opts.sources ?? []).map(normalise).sort().join(',')}`
  const existing = inflight.get(key)
  if (existing) return existing
  const job = runWithJobPrisma(() => execute(opts)).finally(() => {
    inflight.delete(key)
  })
  inflight.set(key, job)
  return job
}

/** One cron chunk: a single source, or the finalize step. */
export function runRefreshChunk(id: string) {
  assertChunksCoverSources()
  const chunk = chunkById(id)
  if (!chunk) return Promise.reject(new Error(`Unknown refresh chunk: ${id}`))
  if (chunk.finalize) return refreshSources({ finalize: true, chunk: true })
  return refreshSources({ sources: chunk.sources, chunk: true, invocationBudgetMs: REFRESH_INVOCATION_BUDGET_MS })
}

/** Runs every source sequentially, then quality + local import. Concurrent callers share the same run. */
export function refreshAllSources() {
  return refreshSources()
}

async function noteSourceOutcome(name: string, error: string | null) {
  const { noteSourceFailure, noteSourceSuccess } = await import('@/lib/ops/source-pause')
  if (!error) await noteSourceSuccess(name)
  else if (!isPartialRefresh(error)) await noteSourceFailure(name, error)
}

function readSourceRun(value: number | SourceFetchResult | null, fallbackSaved: number, error: Error | null) {
  if (value && typeof value === 'object') {
    return {
      saved: value.saved,
      continuation: value.continuation === true,
      more: value.more === true,
      sweepId: value.sweepId ?? null,
    }
  }
  const progress = readSweepProgress(error)
  return {
    saved: typeof value === 'number' ? value : fallbackSaved,
    continuation: progress?.continuation === true,
    more: progress?.more === true,
    sweepId: progress?.sweepId ?? null,
  }
}

async function runNamed(name: string, fn: () => Promise<number | SourceFetchResult>, budgetMs: number) {
  console.log(`[refresh] starting ${name} (budget ${Math.round(budgetMs / 1000)}s)`)
  const run = await runWithSourceBudget(name, budgetMs, fn)
  const outcome = readSourceRun(run.value, run.saved, run.error)
  const added = outcome.saved
  const error = run.error
    ? `${name}: ${run.error.message}`
    : run.timedOut
      ? `${name}: time budget reached after saving ${added} events`
      : null
  if (error) console.error(`[refresh] ${name} finished with ${added} events: ${error}`)
  else console.log(`[refresh] ${name} finished: ${added} events`)
  return { added, error, continuation: outcome.continuation, more: outcome.more, sweepId: outcome.sweepId }
}

async function execute(opts: RefreshSourcesOptions): Promise<RefreshResult> {
  assertChunksCoverSources()
  const requested = (opts.sources ?? []).map((s) => s.trim()).filter(Boolean)
  const hasFilter = requested.length > 0
  if (opts.finalize && !hasFilter) return finalizeCycle()

  const log = opts.chunk ? null : await prisma.refreshLog.create({ data: {} })
  let total = 0
  const errors: string[] = []
  const wanted = new Set(requested.map(normalise))
  const known = new Set(SOURCE_NAMES.map(normalise))
  const selected = hasFilter ? SOURCES.filter(([name]) => wanted.has(normalise(name))) : SOURCES
  const runPost = opts.finalize === true || !hasFilter
  const started = Date.now()

  if (hasFilter) {
    for (const name of requested) {
      if (!known.has(normalise(name))) errors.push(`Unknown source: ${name}`)
    }
  }

  const sourcesRun: string[] = []
  for (const [name, fn] of selected) {
    if (opts.invocationBudgetMs != null && Date.now() - started > opts.invocationBudgetMs) {
      errors.push(`${name}: skipped to stay inside the function time limit`)
      console.error(`[refresh] ${name} skipped: invocation time budget`)
      continue
    }
    const { sourceShouldRunNow } = await import('@/lib/ops/source-pause')
    if (!(await sourceShouldRunNow(name))) {
      console.log(`[refresh] ${name} is paused; next try is in a few hours`)
      continue
    }
    const sourceLog = opts.chunk ? await prisma.refreshLog.create({ data: { status: 'running' } }) : null
    const { added, error, continuation, more, sweepId } = await runNamed(name, fn, budgetFor(name))
    total += added
    sourcesRun.push(name)
    if (error) errors.push(error)
    const storedError = withSweepMark(error, { continuation, more, sweepId })
    if (sourceLog) {
      await prisma.refreshLog.update({
        where: { id: sourceLog.id },
        data: {
          status: sourceLogStatus(name),
          endedAt: new Date(),
          eventsAdded: added,
          errors: storedError,
        },
      })
    }
    await noteSourceOutcome(name, error)
    await noteVolume(name, { saved: added, continuation, more, sweepId }, error, sourceLog?.id ?? null)
  }

  if (runPost && !opts.chunk) {
    const post = await runPostSteps()
    errors.push(...post)
  }

  if (!log) return { eventsAdded: total, errors, sourcesRun }

  const hard = errors.filter((e) => {
    const failure = refreshFailure(e)
    return !!failure && !isPartialRefresh(failure) && !failure.startsWith('Unknown source:')
  })
  const sourceFailed = selected.filter(([name]) => hard.some((e) => e.startsWith(`${name}:`))).length
  const status = selected.length > 0 && sourceFailed === selected.length ? 'failed' : 'completed'
  await prisma.refreshLog.update({
    where: { id: log.id },
    data: {
      status,
      endedAt: new Date(),
      eventsAdded: total,
      errors: errors.length ? errors.join('; ') : null,
    },
  })
  if (hard.length) await reportFullRunFaults(log.id, selected.length, sourceFailed, hard)
  if (runPost) await boundedImagePass()
  await invalidatePublicListings()
  return { eventsAdded: total, errors, sourcesRun }
}

/** Artwork follow-up stays inside the cron that started it. The old fire-and-forget pass ran for minutes on the same instance as the next cron. */
async function boundedImagePass() {
  await Promise.race([
    (async () => {
      const { flushPendingDisplays } = await import('@/lib/images/display-store')
      await flushPendingDisplays({ limit: 8, budgetMs: 12_000 })
      await runImagePass({ trigger: 'refresh', budgetMs: 12_000 })
    })(),
    new Promise((resolve) => setTimeout(resolve, 25_000)),
  ]).catch((err) => console.error('[images] pass failed', err instanceof Error ? err.message : err))
}

async function invalidatePublicListings() {
  try {
    const { invalidatePublicEvents } = await import('@/lib/public-cache')
    await invalidatePublicEvents()
  } catch (err) {
    console.error('[refresh] cache invalidation failed', (err as { message?: string })?.message)
  }
}

async function noteVolume(
  name: string,
  outcome: { saved: number; continuation: boolean; more: boolean; sweepId?: string | null },
  error: string | null,
  logId: string | null,
) {
  const logs = await prisma.refreshLog.findMany({
    where: {
      status: sourceLogStatus(name),
      endedAt: { not: null },
      ...(logId ? { id: { not: logId } } : {}),
    },
    orderBy: { startedAt: 'desc' },
    take: 40,
    select: { eventsAdded: true, errors: true },
  })
  const history = logs.map((log) => sweepRunFromLog(log.eventsAdded, log.errors))
  const { signal, comparison } = sourceVolumeSignal(history, {
    events: outcome.saved,
    continuation: outcome.continuation,
    more: outcome.more,
    unmarked: false,
    sweepId: outcome.sweepId ?? null,
    failed: !!error && !isPartialRefresh(error),
    timedOut: isPartialRefresh(error),
  })
  if (!signal) {
    if (comparison.comparable) await retireVolumeFault(name)
    return
  }
  await recordQualityAlert({
    kind: signal === 'zero' ? 'ZERO_EVENTS' : 'VOLUME_DROP',
    source: name,
    detail: volumeDropDetail(name, signal, comparison),
  })
}

async function runPostSteps(startedAt = Date.now()) {
  const errors: string[] = []
  const elapsed = () => Date.now() - startedAt
  const qualityBudget = postStepBudget(elapsed(), 'quality')
  if (qualityBudget == null) errors.push('Quality pass: time budget reached')
  else {
    const quality = await runWithSourceBudget('Quality pass', qualityBudget, () => runQualityPass())
    if (quality.error) errors.push(`Quality pass: ${quality.error.message}`)
    else if (quality.timedOut) errors.push('Quality pass: time budget reached')
  }
  const localBudget = postStepBudget(elapsed(), 'local')
  if (localBudget == null) errors.push('Local import: time budget reached')
  else {
    const local = await runWithSourceBudget('Local import', localBudget, () => importLocalFromBoard())
    if (local.error) errors.push(`Local import: ${local.error.message}`)
    else if (local.timedOut) errors.push('Local import: time budget reached')
  }
  return errors
}

async function reportFullRunFaults(_logId: string, selected: number, sourceFailed: number, hard: string[]) {
  const { reportFault } = await import('@/lib/owner-alerts')
  if (selected === SOURCES.length && sourceFailed === SOURCES.length) {
    await reportFault({ area: 'Event refresh', key: 'refresh-all-failed', route: '/api/cron/refresh', title: 'Every listings source failed this run', detail: hard.join('\n') })
  }
}

/**
 * One cycle log, then the quality pass and local import.
 * Source chunks have already saved listings. Record that outcome before post-steps
 * so a slow quality pass cannot leave the row `running` until the function is killed.
 * Completed even if a source failed or stopped at its time budget, as long as every chunk finished.
 */
async function finalizeCycle(): Promise<RefreshResult> {
  const since = new Date(Date.now() - REFRESH_CYCLE_WINDOW_MS)
  const logs = await prisma.refreshLog.findMany({
    where: { startedAt: { gte: since }, status: { startsWith: 'source:' } },
    select: { status: true, endedAt: true, errors: true, eventsAdded: true, startedAt: true },
  })
  const cycle = assessRefreshCycle(logs, SOURCE_NAMES)
  const sourceErrors: string[] = []
  for (const name of cycle.missing) sourceErrors.push(`${name}: chunk did not finish this cycle`)
  for (const name of [...cycle.failed, ...cycle.warned]) {
    const row = logs
      .filter((l) => l.status === sourceLogStatus(name) && l.endedAt)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0]
    if (row?.errors) sourceErrors.push(row.errors)
  }
  const status = cycle.ok ? 'completed' : 'failed'
  // Record the cycle before post-steps. Listings are already saved by the source chunks.
  const log = await prisma.refreshLog.create({
    data: {
      status,
      endedAt: new Date(),
      eventsAdded: cycle.eventsAdded,
      errors: sourceErrors.length ? sourceErrors.join('; ') : null,
    },
  })
  console.log(`[refresh] cycle ${status}: ${cycle.eventsAdded} events, missing=${cycle.missing.length}, failed=${cycle.failed.length}, budget=${cycle.warned.length}`)
  const postErrors = await runPostSteps()
  // Retirement reads the finished chunks back from the log ledger, so it runs
  // after the post-steps it must not starve. Its own budget keeps it inside
  // the finalize invocation; a failure here never fails the cycle.
  const retirement = await runWithSourceBudget('Retirement pass', RETIREMENT_PASS_BUDGET_MS, () => runRetirementPass())
  if (retirement.error) postErrors.push(`Retirement pass: ${retirement.error.message}`)
  else if (retirement.timedOut) postErrors.push('Retirement pass: time budget reached')
  if (postErrors.length) {
    await prisma.refreshLog.update({
      where: { id: log.id },
      data: { errors: [...postErrors, ...sourceErrors].join('; ') },
    }).catch((err) => console.error('[refresh] cycle error update failed', (err as { message?: string })?.message))
  }
  if (cycle.ok) await boundedImagePass()
  await invalidatePublicListings()
  return {
    eventsAdded: cycle.eventsAdded,
    errors: [...postErrors, ...sourceErrors],
    sourcesRun: SOURCE_NAMES.filter((name) => !cycle.missing.includes(name)),
    cycleOk: cycle.ok,
  }
}
