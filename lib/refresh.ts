import { prisma } from '@/lib/prisma'
import { fetchTicketmasterEvents } from '@/lib/ticketmaster'
import { fetchEventbriteEvents } from '@/lib/sources/eventbrite'
import { fetchFrontierEvents, fetchCityOfSydneyEvents, fetchHumanitixEvents } from '@/lib/sources/promoters'
import { runQualityPass } from '@/lib/quality-pass'
import { fetchCuratedEvents } from '@/lib/sources/curated'
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
  chunkById,
  isBudgetSkip,
  sourceLogStatus,
} from '@/lib/refresh-plan'

const SOURCES: [string, () => Promise<number>][] = [
  ['Ticketmaster', fetchTicketmasterEvents],
  ['Frontier Touring', fetchFrontierEvents],
  ['City of Sydney', fetchCityOfSydneyEvents],
  ['Humanitix', fetchHumanitixEvents],
  ['Moshtix', fetchMoshtixEvents],
  ['Oztix', fetchOztixEvents],
  ['Ticketek', fetchTicketekEvents],
  ['Eventbrite', fetchEventbriteEvents],
  ['Popular regulars', fetchCuratedEvents],
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
 */
export function refreshSources(opts: RefreshSourcesOptions = {}): Promise<RefreshResult> {
  const key = `${opts.chunk ? 'chunk' : 'full'}|${opts.finalize ? 'fin' : ''}|${(opts.sources ?? []).map(normalise).sort().join(',')}`
  const existing = inflight.get(key)
  if (existing) return existing
  const job = execute(opts).finally(() => {
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

async function faultIfSourceRepeated(name: string, error: string, logId: string) {
  if (isBudgetSkip(error)) return
  const { reportFault } = await import('@/lib/owner-alerts')
  const prev = await prisma.refreshLog.findFirst({
    where: { id: { not: logId }, status: sourceLogStatus(name), endedAt: { not: null } },
    orderBy: { startedAt: 'desc' },
    select: { errors: true },
  })
  if (prev?.errors && !isBudgetSkip(prev.errors) && prev.errors.includes(`${name}:`)) {
    await reportFault({ area: 'Event refresh', key: `refresh-${name}`, title: `${name} failed two refreshes in a row`, detail: error })
  }
}

async function runNamed(name: string, fn: () => Promise<number>, budgetMs: number) {
  console.log(`[refresh] starting ${name} (budget ${Math.round(budgetMs / 1000)}s)`)
  const run = await runWithSourceBudget(name, budgetMs, fn)
  const added = run.value ?? run.saved
  const error = run.error
    ? `${name}: ${run.error.message}`
    : run.timedOut
      ? `${name}: time budget reached after saving ${added} events`
      : null
  if (error) console.error(`[refresh] ${name} finished with ${added} events: ${error}`)
  else console.log(`[refresh] ${name} finished: ${added} events`)
  return { added, error }
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
    const sourceLog = opts.chunk ? await prisma.refreshLog.create({ data: { status: 'running' } }) : null
    const { added, error } = await runNamed(name, fn, budgetFor(name))
    total += added
    sourcesRun.push(name)
    if (error) errors.push(error)
    if (sourceLog) {
      await prisma.refreshLog.update({
        where: { id: sourceLog.id },
        data: {
          status: sourceLogStatus(name),
          endedAt: new Date(),
          eventsAdded: added,
          errors: error,
        },
      })
      if (error) await faultIfSourceRepeated(name, error, sourceLog.id)
    }
  }

  if (runPost && !opts.chunk) {
    const post = await runPostSteps()
    errors.push(...post)
  }

  if (!log) return { eventsAdded: total, errors, sourcesRun }

  const hard = errors.filter((e) => !isBudgetSkip(e) && !e.startsWith('Unknown source:'))
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
  if (runPost) void runImagePass({ trigger: 'refresh' })
  return { eventsAdded: total, errors, sourcesRun }
}

async function runPostSteps() {
  const errors: string[] = []
  const quality = await runWithSourceBudget('Quality pass', 100_000, () => runQualityPass())
  if (quality.error) errors.push(`Quality pass: ${quality.error.message}`)
  else if (quality.timedOut) errors.push('Quality pass: time budget reached')
  const local = await runWithSourceBudget('Local import', 80_000, () => importLocalFromBoard())
  if (local.error) errors.push(`Local import: ${local.error.message}`)
  else if (local.timedOut) errors.push('Local import: time budget reached')
  return errors
}

async function reportFullRunFaults(logId: string, selected: number, sourceFailed: number, hard: string[]) {
  const { reportFault } = await import('@/lib/owner-alerts')
  if (selected === SOURCES.length && sourceFailed === SOURCES.length) {
    await reportFault({ area: 'Event refresh', key: 'refresh-all-failed', title: 'Every listings source failed this run', detail: hard.join('\n') })
    return
  }
  const prev = await prisma.refreshLog.findFirst({
    where: { id: { not: logId }, endedAt: { not: null }, status: { in: ['completed', 'failed'] } },
    orderBy: { startedAt: 'desc' },
    select: { errors: true },
  })
  for (const err of hard) {
    const name = err.split(':')[0]
    const repeated = (prev?.errors ?? '').split('; ').some((part) => part.startsWith(`${name}:`) && !isBudgetSkip(part))
    if (repeated) {
      await reportFault({ area: 'Event refresh', key: `refresh-${name}`, title: `${name} failed two refreshes in a row`, detail: err })
    }
  }
}

/** Quality pass + local import, then one cycle log. Completed even if a source failed, as long as every chunk finished. */
async function finalizeCycle(): Promise<RefreshResult> {
  const log = await prisma.refreshLog.create({ data: {} })
  const errors = await runPostSteps()
  const since = new Date(Date.now() - REFRESH_CYCLE_WINDOW_MS)
  const logs = await prisma.refreshLog.findMany({
    where: { startedAt: { gte: since }, status: { startsWith: 'source:' } },
    select: { status: true, endedAt: true, errors: true, eventsAdded: true, startedAt: true },
  })
  const cycle = assessRefreshCycle(logs, SOURCE_NAMES)
  for (const name of cycle.missing) errors.push(`${name}: chunk did not finish this cycle`)
  for (const name of [...cycle.failed, ...cycle.warned]) {
    const row = logs
      .filter((l) => l.status === sourceLogStatus(name) && l.endedAt)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0]
    if (row?.errors) errors.push(row.errors)
  }
  const status = cycle.ok ? 'completed' : 'failed'
  await prisma.refreshLog.update({
    where: { id: log.id },
    data: {
      status,
      endedAt: new Date(),
      eventsAdded: cycle.eventsAdded,
      errors: errors.length ? errors.join('; ') : null,
    },
  })
  console.log(`[refresh] cycle ${status}: ${cycle.eventsAdded} events, missing=${cycle.missing.length}, failed=${cycle.failed.length}, budget=${cycle.warned.length}`)
  if (cycle.ok) void runImagePass({ trigger: 'refresh' })
  return {
    eventsAdded: cycle.eventsAdded,
    errors,
    sourcesRun: SOURCE_NAMES.filter((name) => !cycle.missing.includes(name)),
    cycleOk: cycle.ok,
  }
}
