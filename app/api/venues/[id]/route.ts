import { NextResponse } from 'next/server'
import { getSessionUser, unauthorized } from '@/lib/session'
import { ownershipUiEnabled } from '@/lib/ownership'
import { canManageVenue, publicVenue, updateVenue } from '@/lib/venue-access'
import { prisma } from '@/lib/db'
import { profileCompleteness } from '@/lib/ownership'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params
  const venue = await publicVenue(id)
  if (!venue) return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
  const me = await getSessionUser().catch(() => null)
  const access = me ? await canManageVenue(me.id, id) : { allowed: false, role: null }
  let claim = null
  if (me) {
    claim = await prisma.venueClaimRequest.findFirst({
      where: { venueId: id, claimantUserId: me.id },
      orderBy: { submittedAt: 'desc' },
      select: { id: true, status: true, submittedAt: true },
    }).catch(() => null)
  }
  const row = access.allowed ? await prisma.venue.findUnique({ where: { id } }) : null
  return NextResponse.json({
    venue,
    access: { allowed: access.allowed, role: access.role },
    claim,
    completeness: row ? profileCompleteness(row) : venue.completeness,
    tools: ownershipUiEnabled(),
  })
}

export async function PATCH(req: Request, { params }: Ctx) {
  if (!ownershipUiEnabled()) return NextResponse.json({ error: 'These tools are turned off.' }, { status: 404 })
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const result = await updateVenue(me.id, id, body)
  if ('error' in result && result.status !== 200) return NextResponse.json(result, { status: result.status })
  return NextResponse.json(result)
}
