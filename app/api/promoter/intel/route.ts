import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, isPromoter, unauthorized, forbidden } from '@/lib/session'
import { getVenueIntelCached } from '@/lib/intel/analytics'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** OUTZA Intelligence venue report for one of the promoter's own events (admins can view any). */
export async function GET(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const eventId = new URL(req.url).searchParams.get('eventId') ?? ''
  if (!eventId) return NextResponse.json({ error: 'Pick an event' }, { status: 400 })
  const ev = await prisma.event.findUnique({ where: { id: eventId }, select: { promoterId: true } })
  if (!ev) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (ev.promoterId !== me.id && me.role !== 'ADMIN') return forbidden()
  try {
    const data = await getVenueIntelCached(eventId)
    await prisma.intelAuditLog.create({ data: { userId: me.id, action: 'view_venue_report', detail: eventId } }).catch(() => {})
    return NextResponse.json(data)
  } catch (e) {
    console.error('[promoter/intel]', e)
    return NextResponse.json({ error: 'Could not build the report right now' }, { status: 500 })
  }
}
