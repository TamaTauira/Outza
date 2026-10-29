import { prisma } from '@/lib/prisma'
import { fetchTicketmasterEvents } from '@/lib/ticketmaster'
import { fetchEventbriteEvents } from '@/lib/sources/eventbrite'
import { fetchFrontierEvents, fetchCityOfSydneyEvents, fetchHumanitixEvents } from '@/lib/sources/promoters'
import { runQualityPass } from '@/lib/quality-pass'
import { fetchCuratedEvents } from '@/lib/sources/curated'
import { runImagePass } from '@/lib/images/runner'
import { importLocalFromBoard } from '@/lib/local-import'
import { fetchMoshtixEvents, fetchOztixEvents, fetchTicketekEvents } from '@/lib/sources/ticketing'

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

export type RefreshResult = { eventsAdded: number; errors: string[]; sourcesRun: string[] }

export type RefreshSourcesOptions = {
  /** Display names to run. Omit for every source, unless `finalize` is set with no names (post-steps only). */
  sources?: string[]
  /** Run the quality pass and local import (and fire-and-forget image pass) after this chunk. */
  finalize?: boolean
}

let running: Promise<RefreshResult> | null = null

function normalise(name: string) {
  return name.trim().toLowerCase()
}

/**
 * Run named sources, or every source when no filter is given.
 * A `finalize` call with no source filter runs only the quality pass and local import.
 * Concurrent callers in this process share the in-flight run.
 * Each call writes a RefreshLog and marks it completed or failed when the chunk ends.
 */
export function refreshSources(opts: RefreshSourcesOptions = {}): Promise<RefreshResult> {
  if (running) return running
  running = (async () => {
    const log = await prisma.refreshLog.create({ data: {} })
    let total = 0
    const errors: string[] = []
    const requested = (opts.sources ?? []).map((s) => s.trim()).filter(Boolean)
    const hasFilter = requested.length > 0
    const wanted = new Set(requested.map(normalise))
    const known = new Set(SOURCE_NAMES.map(normalise))
    // No names + finalize: post-steps only, so a chunked refresh can finish inside maxDuration.
    // No names and no finalize: full run (refreshAllSources backward compat).
    const selected = hasFilter ? SOURCES.filter(([name]) => wanted.has(normalise(name))) : opts.finalize ? [] : SOURCES
    const runPost = opts.finalize === true || !hasFilter

    if (hasFilter) {
      for (const name of requested) {
        if (!known.has(normalise(name))) errors.push(`Unknown source: ${name}`)
      }
    }

    for (const [name, fn] of selected) {
      try {
        total += await fn()
      } catch (e: any) {
        errors.push(`${name}: ${e?.message ?? 'failed'}`)
        console.error(`[refresh] ${name} failed:`, e?.message)
      }
    }
    if (runPost) {
      try {
        await runQualityPass()
      } catch (e: any) {
        errors.push(`Quality pass: ${e?.message ?? 'failed'}`)
        console.error('[refresh] quality pass failed:', e?.message)
      }
      try {
        await importLocalFromBoard()
      } catch (e: any) {
        errors.push(`Local import: ${e?.message ?? 'failed'}`)
        console.error('[refresh] local import failed:', e?.message)
      }
    }

    const sourceFailed = selected.filter(([name]) => errors.some((e) => e.startsWith(`${name}:`))).length
    const postFailed = ['Quality pass', 'Local import'].filter((name) => errors.some((e) => e.startsWith(`${name}:`))).length
    const status =
      hasFilter && selected.length === 0
        ? 'failed'
        : selected.length > 0 && sourceFailed === selected.length
          ? 'failed'
          : selected.length === 0 && postFailed === 2
            ? 'failed'
            : 'completed'

    await prisma.refreshLog.update({
      where: { id: log.id },
      data: {
        status,
        endedAt: new Date(),
        eventsAdded: total,
        errors: errors.length ? errors.join('; ') : null,
      },
    })
    // Owner fault alerts: whole run failed, or a source failed two runs in a row (one-off hiccups stay quiet)
    if (errors.length) {
      const { reportFault } = await import('@/lib/owner-alerts')
      if (selected.length === SOURCES.length && sourceFailed === SOURCES.length) {
        await reportFault({ area: 'Event refresh', key: 'refresh-all-failed', route: '/api/cron/refresh', title: 'Every listings source failed this run', detail: errors.join('\n') })
      } else {
        const prev = await prisma.refreshLog.findFirst({ where: { id: { not: log.id }, endedAt: { not: null } }, orderBy: { startedAt: 'desc' }, select: { errors: true } })
        for (const err of errors) {
          const name = err.split(':')[0]
          if (prev?.errors?.includes(`${name}:`)) {
            await reportFault({ area: 'Event refresh', key: `refresh-${name}`, route: '/api/cron/refresh', title: `${name} failed two refreshes in a row`, detail: err })
          }
        }
      }
    }
    // Image import/optimisation runs in the background and never blocks event ingestion
    if (runPost) void runImagePass({ trigger: 'refresh' })
    return { eventsAdded: total, errors, sourcesRun: selected.map(([name]) => name) }
  })().finally(() => {
    running = null
  })
  return running
}

/** Runs every source sequentially, then quality + local import. Concurrent callers share the same run. */
export function refreshAllSources() {
  return refreshSources()
}
