import { NextResponse } from 'next/server'
import { getSessionUser, unauthorized } from '@/lib/session'
import { ownershipUiEnabled } from '@/lib/ownership'
import { guardVenueAnalytics } from '@/lib/venue-access'
import { loadVenueReach, reachCsv } from '@/lib/organiser-reach-load'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!ownershipUiEnabled()) return NextResponse.json({ error: 'These tools are turned off.' }, { status: 404 })
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const { id } = await params
  const gate = await guardVenueAnalytics(me.id, id)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const url = new URL(req.url)
  const payload = await loadVenueReach(id, {
    range: url.searchParams.get('range'),
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
    eventId: url.searchParams.get('eventId'),
  })
  return new NextResponse(reachCsv(payload), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="vibepeep-venue-results.csv"',
    },
  })
}
