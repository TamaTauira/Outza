import { NextResponse } from 'next/server'
import { runWeeklyPromoterReports } from '@/lib/promoter-report'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** Weekly promoter reports. Trigger with the x-cron-secret header (CRON_SECRET) or as an admin. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  const header = req.headers.get('x-cron-secret')
  const me = await getSessionUser().catch(() => null)
  if (!(secret && header === secret) && me?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }
  return NextResponse.json(await runWeeklyPromoterReports())
}
