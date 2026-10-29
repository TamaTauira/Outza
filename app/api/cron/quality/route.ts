import { NextResponse } from 'next/server'
import { runQualityPass } from '@/lib/quality-pass'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** Duplicate merge plus an expired-listing audit. Listings are flagged or hidden, never deleted. */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get('authorization')
  const header = req.headers.get('x-cron-secret')
  const me = await getSessionUser().catch(() => null)
  const authed = !!secret && (bearer === `Bearer ${secret}` || header === secret)
  if (!authed && me?.role !== 'ADMIN') return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  return NextResponse.json(await runQualityPass())
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
