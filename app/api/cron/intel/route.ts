import { NextResponse } from 'next/server'
import { runDueSources } from '@/lib/intel/ingest'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Runs any OUTZA Intelligence source that is due (also runs hourly in the background). */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  const me = await getSessionUser().catch(() => null)
  if (!(secret && req.headers.get('x-cron-secret') === secret) && me?.role !== 'ADMIN') return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  return NextResponse.json({ ran: await runDueSources() })
}
