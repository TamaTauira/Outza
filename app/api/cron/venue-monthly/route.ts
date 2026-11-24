import { NextResponse } from 'next/server'
import { runVenueMonthlyReports } from '@/lib/venue-monthly'
import { cronAuthorized } from '@/lib/cron-auth'
import { getSessionUser } from '@/lib/session'
import { writeHeartbeat } from '@/lib/job-watermark'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Monthly venue stats. Minute 31, after the refresh writes, once a month. */
async function run(req: Request) {
  const me = await getSessionUser().catch(() => null)
  if (!cronAuthorized(req, me?.role)) {
    console.error('[cron] venue monthly unauthorized')
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }
  try {
    const result = await runVenueMonthlyReports()
    console.log('[cron] venue monthly', result)
    await writeHeartbeat('venue-monthly').catch(() => {})
    return NextResponse.json(result)
  } catch (err) {
    console.error('[cron] venue monthly failed', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Venue monthly note failed' }, { status: 500 })
  }
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
