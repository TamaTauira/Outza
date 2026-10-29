/** Any uncaught server error (pages, API routes, server actions) emails the owner immediately. */
export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routePath?: string; routeType?: string }) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  try {
    const e = err as { message?: string; stack?: string; digest?: string }
    const route = context?.routePath || request.path.split('?')[0]
    const { reportFault } = await import('@/lib/owner-alerts')
    await reportFault({
      area: 'Server error',
      key: `server-${route}-${(e?.message ?? '').slice(0, 120)}`,
      title: `${request.method} ${route}: ${(e?.message ?? 'Unknown error').slice(0, 120)}`,
      detail: `Path: ${request.path.split('?')[0]}\nType: ${context?.routeType ?? 'unknown'}${e?.digest ? `\nDigest: ${e.digest}` : ''}\n\n${(e?.stack ?? '').slice(0, 3000)}`,
    })
  } catch {}
}

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const REFRESH_MS = 2 * 60 * 60 * 1000
    const run = async (label: string, onlyIfStale: boolean) => {
      try {
        const { prisma } = await import('@/lib/prisma')
        const { refreshAllSources } = await import('@/lib/refresh')
        if (onlyIfStale) {
          const last = await prisma.refreshLog.findFirst({
            where: { status: 'completed' },
            orderBy: { startedAt: 'desc' },
          })
          if (last && Date.now() - last.startedAt.getTime() < REFRESH_MS) return
        }
        const { eventsAdded } = await refreshAllSources()
        console.log(`[${label}] Refreshed ${eventsAdded} events from all sources`)
      } catch (err: any) {
        console.error(`[${label}] Refresh failed:`, err?.message)
      }
    }

    const digests = async () => {
      try {
        const { runDueDigests } = await import('@/lib/digest')
        const { checked, sent } = await runDueDigests()
        if (sent) console.log(`[Digest] Sent ${sent} of ${checked} opted-in users`)
        try {
          const { runWatchMail } = await import('@/lib/watch-mail')
          const watch = await runWatchMail()
          if (watch.digests.sent || watch.reminders.sent) console.log('[Watchlist]', watch)
        } catch (err: any) {
          console.error('[Watchlist] failed:', err?.message)
        }
      } catch (err: any) {
        console.error('[Digest] failed:', err?.message)
      }
    }

    // Owner alerts: fortnightly ideas summary (only when there are ideas) + fault health checks
    const ownerJobs = async () => {
      try {
        const { runIdeasDigest, runHealthChecks } = await import('@/lib/owner-alerts')
        const r = await runIdeasDigest()
        if (r.sent) console.log(`[Owner] Ideas summary sent (${r.count})`)
        await runHealthChecks()
      } catch (err: any) {
        console.error('[Owner] alerts job failed:', err?.message)
      }
    }
    // VibePeep Intelligence: import any official data source that is due (each has its own schedule)
    const intelJobs = async () => {
      try {
        const { runDueSources } = await import('@/lib/intel/ingest')
        const r = await runDueSources()
        if (Object.keys(r).length) console.log('[Intel] Sources run:', r)
      } catch (err: any) {
        console.error('[Intel] ingest job failed:', err?.message)
      }
    }
    setTimeout(intelJobs, 15 * 60 * 1000)
    setInterval(intelJobs, 60 * 60 * 1000)

    setTimeout(ownerJobs, 10 * 60 * 1000)
    setInterval(ownerJobs, 60 * 60 * 1000)

    setTimeout(() => run('Startup', true), 5000)
    // Refresh listings (incl. live ticket prices) every 2 hours
    setInterval(() => run('Scheduled', false), REFRESH_MS)
    // Check hourly for users due their daily / weekly / monthly email
    setTimeout(digests, 60 * 1000)
    setInterval(digests, 60 * 60 * 1000)
  }
}
