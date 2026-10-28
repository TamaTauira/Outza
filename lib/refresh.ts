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

let running: Promise<{ eventsAdded: number; errors: string[] }> | null = null

/** Runs every source sequentially; concurrent callers share the same run. */
export function refreshAllSources() {
  if (running) return running
  running = (async () => {
    const log = await prisma.refreshLog.create({ data: {} })
    let total = 0
    const errors: string[] = []
    for (const [name, fn] of SOURCES) {
      try {
        total += await fn()
      } catch (e: any) {
        errors.push(`${name}: ${e?.message ?? 'failed'}`)
        console.error(`[refresh] ${name} failed:`, e?.message)
      }
    }
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
    await prisma.refreshLog.update({
      where: { id: log.id },
      data: {
        status: errors.length === SOURCES.length ? 'failed' : 'completed',
        endedAt: new Date(),
        eventsAdded: total,
        errors: errors.length ? errors.join('; ') : null,
      },
    })
    // Owner fault alerts: whole run failed, or a source failed two runs in a row (one-off hiccups stay quiet)
    if (errors.length) {
      const { reportFault } = await import('@/lib/owner-alerts')
      if (errors.length >= SOURCES.length) {
        await reportFault({ area: 'Event refresh', key: 'refresh-all-failed', title: 'Every listings source failed this run', detail: errors.join('\n') })
      } else {
        const prev = await prisma.refreshLog.findFirst({ where: { id: { not: log.id }, endedAt: { not: null } }, orderBy: { startedAt: 'desc' }, select: { errors: true } })
        for (const err of errors) {
          const name = err.split(':')[0]
          if (prev?.errors?.includes(`${name}:`)) {
            await reportFault({ area: 'Event refresh', key: `refresh-${name}`, title: `${name} failed two refreshes in a row`, detail: err })
          }
        }
      }
    }
    // Image import/optimisation runs in the background and never blocks event ingestion
    void runImagePass({ trigger: 'refresh' })
    return { eventsAdded: total, errors }
  })().finally(() => {
    running = null
  })
  return running
}
