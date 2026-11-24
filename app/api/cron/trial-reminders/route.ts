import { NextResponse } from 'next/server'
import { runTrialReminders } from '@/lib/account-flow'
import { cronAuthorized } from '@/lib/cron-auth'
import { getSessionUser } from '@/lib/session'
import { writeHeartbeat } from '@/lib/job-watermark'

export const dynamic = 'force-dynamic'

/** One reminder in the last three days of a Stripe trial. Vercel Cron calls GET. */
export async function GET(req: Request) {
  const me = await getSessionUser().catch(() => null)
  if (!cronAuthorized(req, me?.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  try {
    const result = await runTrialReminders()
    await writeHeartbeat('trial-reminders').catch(() => {})
    return NextResponse.json(result)
  } catch (err) {
    console.error('[trial] reminder run failed', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Reminder run failed' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  return GET(req)
}
