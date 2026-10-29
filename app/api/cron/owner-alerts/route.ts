import { NextResponse } from 'next/server'
import { runIdeasDigest, runHealthChecks } from '@/lib/owner-alerts'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** Owner ideas summary and fault checks. Vercel Cron calls GET; `?force=1` sends the ideas summary now. */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get('authorization')
  const header = req.headers.get('x-cron-secret')
  const me = await getSessionUser().catch(() => null)
  const authed = !!secret && (bearer === `Bearer ${secret}` || header === secret)
  if (!authed && me?.role !== 'ADMIN') return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const force = new URL(req.url).searchParams.get('force') === '1'
  const ideas = await runIdeasDigest({ force })
  await runHealthChecks()
  return NextResponse.json({ ideas })
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
