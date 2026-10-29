import { NextResponse } from 'next/server'
import { runDueDigests } from '@/lib/digest'
import { cronAuthorized } from '@/lib/cron-auth'
import { recordMailDelivery } from '@/lib/mail-log'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Newsletter digests. Vercel Cron calls GET with Authorization: Bearer CRON_SECRET. */
async function run(req: Request) {
  const me = await getSessionUser().catch(() => null)
  if (!cronAuthorized(req, me?.role)) {
    console.error('[cron] digest unauthorized')
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }
  try {
    const result = await runDueDigests()
    console.log('[cron] digest', result)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Digest run failed'
    console.error('[cron] digest failed', message)
    await recordMailDelivery({ kind: 'newsletter-run', status: 'failed', error: message })
    return NextResponse.json({ error: 'Digest run failed' }, { status: 500 })
  }
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
