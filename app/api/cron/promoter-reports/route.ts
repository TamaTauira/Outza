import { NextResponse } from 'next/server'
import { runWeeklyPromoterReports } from '@/lib/promoter-report'
import { cronAuthorized } from '@/lib/cron-auth'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Weekly promoter recaps. Vercel Cron calls GET with Authorization: Bearer CRON_SECRET. */
async function run(req: Request) {
  const me = await getSessionUser().catch(() => null)
  if (!cronAuthorized(req, me?.role)) {
    console.error('[cron] promoter reports unauthorized')
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }
  try {
    const result = await runWeeklyPromoterReports()
    console.log('[cron] promoter reports', result)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[cron] promoter reports failed', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Promoter recap run failed' }, { status: 500 })
  }
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
