import { NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cron-auth'
import { runWeeklyDigest } from '@/lib/ops/digest-run'
import { writeHeartbeat } from '@/lib/job-watermark'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Monday 9:00 am AEDT (22:00 UTC Sunday). One email, and only when something is waiting. */
async function run(req: Request) {
  const me = await getSessionUser().catch(() => null)
  if (!cronAuthorized(req, me?.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const result = await runWeeklyDigest()
  await writeHeartbeat('ops-digest').catch(() => {})
  return NextResponse.json(result)
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
