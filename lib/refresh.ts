import { prisma, runWithJobPrisma } from '@/lib/prisma'
import { writeHeartbeat } from '@/lib/job-watermark'
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
import { CITIES, type CityDef } from '@/lib/cities'
import {
  REFRESH_CHUNKS,
  REFRESH_CYCLE_WINDOW_MS,
  REFRESH_INVOCATION_BUDGET_MS,
  SOURCE_BUDGET_MAX_MS,
  TOTALS_WARM_BUDGET_MS,
  TOTALS_WARM_CITY_BUDGET_MS,
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

export type TotalsWarmOutcome = { warmed: string[]; failed: string[]; skipped: string[] }

/**
 * Walk cities two at a time — the guide-model walk's shape: each
 * city's totals are a full chunked scan, and nine at once would crowd
 * the shared pool — warming each through `warmOne` with the smaller
 * of its per-city budget and what is left of the warm's wall clock.
 * A city that fails is recorded and the walk continues: the warm is a
 * finalize post-step, so one city's failure may not fail the cycle or
 * block the cities behind it. Cities the wall clock runs out on are
 * skipped, not failed. Outcomes are reported in catalogue order.
 */
export async function warmTotalsCities(
  cities: readonly CityDef[],
  warmOne: (city: CityDef, budgetMs: number) => Promise<boolean>,
  opts: { budgetMs: number; cityBudgetMs: number; now?: () => number },
): Promise<TotalsWarmOutcome> {
  const now = opts.now ?? Date.now
  const startedAt = now()
  const outcome: TotalsWarmOutcome = { warmed: [], failed: [], skipped: [] }
  const pending = [...cities]
  const workers = Array.from({ length: Math.min(2, pending.length) }, async () => {
    for (;;) {
      const city = pending.shift()
      if (!city) return
      const left = opts.budgetMs - (now() - startedAt)
      if (left <= 0) {
        outcome.skipped.push(city.name)
        continue
      }
      let ok = false
      try {
        ok = await warmOne(city, Math.min(opts.cityBudgetMs, left))
      } catch {
        ok = false
      }
      ;(ok ? outcome.warmed : outcome.failed).push(city.name)
    }
  })
  await Promise.all(workers)
  const order = new Map(cities.map((c, i) => [c.name, i] as const))
  const byCatalogue = (a: string, b: string) => (order.get(a) ?? 0) - (order.get(b) ?? 0)
  outcome.warmed.sort(byCatalogue)
  outcome.failed.sort(byCatalogue)
  outcome.skipped.sort(byCatalogue)
  return outcome
}

/**
 * Recompute the suburb totals the guide navigation prints, here in
 * finalize rather than leaving the recompute to guide renders. The
 * totals scan is the heaviest read on the site (a full-city chunked
 * gather), and under database saturation a render-triggered fill
 * could not complete — on 2026-11-28 every revalidation of the
 * Sydney entry failed from ~20:43 on, and the nav printed a
 * computation over an hour old before the totals read's age judgement
 * dropped it. Warming through the same cached path the renders read
 * fills the same cache entries, on the ingest cadence; between warms
 * the age judgement guarantees the counts degrade honestly (last good
 * for an hour from computation, then no count). Each city is isolated
 * in the budgeted post-step pattern: a failure or timeout logs and
 * never fails the cycle. Inside the warm the scan's per-chunk
 * statement budget is the warm's longer one — the race there does
 * not cancel the SQL, so the longer wait is what lets chunks actually
 * finish in this context. The render path's budget is unchanged.
 */
async function warmSuburbTotals() {
  try {
    const { citySuburbTotals, runWithTotalsScanBudget, TOTALS_WARM_STATEMENT_TIMEOUT_MS } = await import('@/lib/seo-server')
    const outcome = await warmTotalsCities(CITIES, async (city, budgetMs) => {
      const run = await runWithSourceBudget(`Suburb totals warm ${city.name}`, budgetMs, () =>
        runWithTotalsScanBudget(TOTALS_WARM_STATEMENT_TIMEOUT_MS, () => citySuburbTotals(city)))
      if (run.error) {
        console.error(`[refresh] suburb totals warm failed for ${city.name}: ${run.error.message}`)
        return false
      }
      if (run.timedOut) {
        console.error(`[refresh] suburb totals warm for ${city.name} hit its time budget`)
        return false
      }
      if (!run.value?.ok) {
        console.error(`[refresh] suburb totals warm did not refresh ${city.name}: the totals read failed, last good totals kept`)
        return false
      }
      return true
    }, { budgetMs: TOTALS_WARM_BUDGET_MS, cityBudgetMs: TOTALS_WARM_CITY_BUDGET_MS })
    console.log(`[refresh] suburb totals warm: ${outcome.warmed.length}/${CITIES.length} cities refreshed${outcome.failed.length ? `; failed: ${outcome.failed.join(', ')}` : ''}${outcome.skipped.length ? `; skipped: ${outcome.skipped.join(', ')}` : ''}`)
  } catch (err) {
    console.error('[refresh] suburb totals warm failed', err instanceof Error ? err.message : err)
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
  console.log('[refresh] finalize started')
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
  // The cycle outcome is recorded, which is the finalize chunk's essential
  // work, so the heartbeat belongs here — not in the cron route after the
  // post-steps. A slow quality pass, retirement pass or image pass (or an
  // invocation killed during one) must not read as a finalize that never
  // finished: the watchdog only sees this heartbeat. The route still writes
  // its own heartbeat when the whole invocation returns.
  await writeHeartbeat('refresh-finalize').catch((err) => console.error('[refresh] finalize heartbeat failed', err instanceof Error ? err.message : err))
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
  // Last, warm the suburb totals (see warmSuburbTotals): invalidation
  // has just dropped the cached fills, and recomputing them here —
  // budgeted, failure-isolated, on the ingest cadence — replaces the
  // render-triggered recompute that saturation starved. Only the
  // finalize cycle warms: it is the path that performs this
  // invalidation at the end of a completed ingest cycle.
  await warmSuburbTotals()
  return {
    eventsAdded: cycle.eventsAdded,
    errors: [...postErrors, ...sourceErrors],
    sourcesRun: SOURCE_NAMES.filter((name) => !cycle.missing.includes(name)),
    cycleOk: cycle.ok,
  }
}
