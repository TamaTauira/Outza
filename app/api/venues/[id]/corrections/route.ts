import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { ownershipUiEnabled, venueRoleAllows } from '@/lib/ownership'
import { unverifiedGate } from '@/lib/account-flow'
import { canManageVenue } from '@/lib/venue-access'
import { saveVenueCorrections } from '@/lib/event-overrides'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!ownershipUiEnabled()) return NextResponse.json({ error: 'These tools are turned off.' }, { status: 404 })
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const gate = await unverifiedGate(me.id)
  if (gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await params
  const access = await canManageVenue(me.id, id)
  if (!access.allowed || !venueRoleAllows(access.role, 'correctEvent')) {
    return NextResponse.json({ error: 'You don’t manage this venue.' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const eventId = String(body?.eventId || '')
  const [event, venue] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId }, select: { id: true, venueId: true, venueName: true, city: true } }),
    prisma.venue.findUnique({ where: { id }, select: { name: true, city: true } }),
  ])
  if (!event || !venue) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  const samePlace = event.city.toLowerCase() === venue.city.toLowerCase()
    && event.venueName.trim().toLowerCase() === venue.name.trim().toLowerCase()
  if (event.venueId !== id && !samePlace) return NextResponse.json({ error: 'That listing is not at this venue.' }, { status: 403 })
  if (!event.venueId) await prisma.event.updateMany({ where: { id: event.id, venueId: null }, data: { venueId: id } })
  const result = await saveVenueCorrections(me.id, event.id, body, access.organisationId)
  if ('error' in result && result.status !== 200) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
