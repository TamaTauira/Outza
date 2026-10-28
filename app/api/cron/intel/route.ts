import { NextResponse } from 'next/server'
import { runDueSources } from '@/lib/intel/ingest'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Runs any OUTZA Intelligence source that is due. Vercel Cron calls GET with Authorization: Bearer CRON_SECRET. */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get('authorization')
  const header = req.headers.get('x-cron-secret')
  const me = await getSessionUser().catch(() => null)
  const authed = !!secret && (bearer === `Bearer ${secret}` || header === secret)
  if (!authed && me?.role !== 'ADMIN') return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  return NextResponse.json({ ran: await runDueSources() })
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
