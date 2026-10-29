import { NextResponse } from 'next/server'
import { runDueDigests } from '@/lib/digest'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

async function run(req: Request) {
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get('authorization')
  const header = req.headers.get('x-cron-secret')
  const me = await getSessionUser().catch(() => null)
  const authed = !!secret && (bearer === `Bearer ${secret}` || header === secret)
  if (!authed && me?.role !== 'ADMIN') return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  return NextResponse.json(await runDueDigests())
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
