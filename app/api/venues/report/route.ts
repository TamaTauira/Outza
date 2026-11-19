import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { managedVenueIds } from '@/lib/venue-access'

export const dynamic = 'force-dynamic'

export async function GET() {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const user = await prisma.user.findUnique({ where: { id: me.id }, select: { venueMonthlyOptOut: true } })
  return NextResponse.json({ venueMonthlyOptOut: !!user?.venueMonthlyOptOut })
}

/** Turns the monthly venue note on or off. Does not change the newsletter. */
export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const venues = await managedVenueIds(me.id).catch(() => [])
  if (!venues.length && me.role !== 'ADMIN') return NextResponse.json({ error: 'You don’t manage a venue.' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const venueMonthlyOptOut = body?.venueMonthlyOptOut === true
  await prisma.user.update({ where: { id: me.id }, data: { venueMonthlyOptOut } })
  return NextResponse.json({ ok: true, venueMonthlyOptOut })
}
