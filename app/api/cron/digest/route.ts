import { NextResponse } from 'next/server'
import { runDueDigests } from '@/lib/digest'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  const header = req.headers.get('x-cron-secret')
  const me = await getSessionUser().catch(() => null)
  if (!(secret && header === secret) && me?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }
  const result = await runDueDigests()
  return NextResponse.json(result)
}
