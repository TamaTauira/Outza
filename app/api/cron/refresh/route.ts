import { NextResponse } from 'next/server'
import { refreshAllSources } from '@/lib/refresh'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Refreshes listings off the request path. Vercel Cron calls GET with Authorization: Bearer CRON_SECRET. */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get('authorization')
  const header = req.headers.get('x-cron-secret')
  const me = await getSessionUser().catch(() => null)
  const authed = !!secret && (bearer === `Bearer ${secret}` || header === secret)
  if (!authed && me?.role !== 'ADMIN') return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { eventsAdded } = await refreshAllSources()
  return NextResponse.json({ eventsAdded })
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
