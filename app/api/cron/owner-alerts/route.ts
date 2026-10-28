import { NextResponse } from 'next/server'
import { runIdeasDigest, runHealthChecks } from '@/lib/owner-alerts'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** Runs the owner jobs on demand (they also run hourly in the background). `?force=1` sends the ideas summary now if there are any. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  const header = req.headers.get('x-cron-secret')
  const me = await getSessionUser().catch(() => null)
  if (!(secret && header === secret) && me?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }
  const force = new URL(req.url).searchParams.get('force') === '1'
  const ideas = await runIdeasDigest({ force })
  await runHealthChecks()
  return NextResponse.json({ ideas })
}
