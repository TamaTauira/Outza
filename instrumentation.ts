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

/**
 * Listing refresh, digests, owner mail and intelligence imports used to start
 * inside this web instance. On Fluid that shares the event loop and the database
 * with page requests, so a cold start made the board wait on ingest. Those jobs
 * now run only from the Vercel cron routes.
 */
export async function register() {}
