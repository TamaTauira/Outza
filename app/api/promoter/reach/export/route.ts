import { NextResponse } from 'next/server'
import { getSessionUser, unauthorized, forbidden, isPromoter } from '@/lib/session'
import { csvWithBom } from '@/lib/organiser-reach'
import { loadPromoterReach, reachCsv } from '@/lib/organiser-reach-load'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const url = new URL(req.url)
  const payload = await loadPromoterReach(me.id, me.role === 'ADMIN', {
    range: url.searchParams.get('range'),
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
    eventId: url.searchParams.get('eventId'),
  })
  return new NextResponse(csvWithBom(reachCsv(payload)), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="vibepeep-results.csv"',
    },
  })
}
