import { NextResponse } from 'next/server'
import { getSessionUser, unauthorized } from '@/lib/session'
import { ownershipUiEnabled } from '@/lib/ownership'
import { guardVenueAnalytics } from '@/lib/venue-access'
import { loadNearbyDemand } from '@/lib/venue-activity-load'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!ownershipUiEnabled()) return NextResponse.json({ error: 'These tools are turned off.' }, { status: 404 })
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const { id } = await params
  const gate = await guardVenueAnalytics(me.id, id)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const nearby = await loadNearbyDemand(id)
  if (!nearby) return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
  return NextResponse.json(nearby)
}
