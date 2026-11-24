import { NextResponse } from 'next/server'
import { runQualityPass } from '@/lib/quality-pass'
import { runAutoResolve } from '@/lib/ops/auto-resolve'
import { writeHeartbeat } from '@/lib/job-watermark'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Duplicate merge plus an expired-listing audit. Listings are flagged or hidden, never deleted. */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get('authorization')
  const header = req.headers.get('x-cron-secret')
  const me = await getSessionUser().catch(() => null)
  const authed = !!secret && (bearer === `Bearer ${secret}` || header === secret)
  if (!authed && me?.role !== 'ADMIN') return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const quality = await runQualityPass()
  const ops = await runAutoResolve().catch((err) => {
    console.error('[ops] auto-resolve failed', err instanceof Error ? err.message : err)
    return { error: 'auto-resolve failed' }
  })
  await writeHeartbeat('quality').catch(() => {})
  return NextResponse.json({ ...quality, ops })
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
