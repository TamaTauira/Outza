import { NextResponse } from 'next/server'
import { runWatchMail } from '@/lib/watch-mail'
import { cronAuthorized } from '@/lib/cron-auth'
import { recordMailDelivery } from '@/lib/mail-log'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Watchlist digests and saved-event reminders. Vercel Cron calls GET with Authorization: Bearer CRON_SECRET. */
async function run(req: Request) {
  const me = await getSessionUser().catch(() => null)
  if (!cronAuthorized(req, me?.role)) {
    console.error('[cron] watchlist unauthorized')
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }
  try {
    const result = await runWatchMail()
    console.log('[cron] watchlist', result)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Watchlist run failed'
    console.error('[cron] watchlist failed', message)
    await recordMailDelivery({ kind: 'watchlist-run', status: 'failed', error: message })
    return NextResponse.json({ error: 'Watchlist run failed' }, { status: 500 })
  }
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
