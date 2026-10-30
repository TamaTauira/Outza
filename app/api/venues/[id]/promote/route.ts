import { NextResponse } from 'next/server'
import { getSessionUser, unauthorized } from '@/lib/session'
import { ownershipUiEnabled, SPONSORED_LABEL } from '@/lib/ownership'
import { startVenuePlacement } from '@/lib/venue-access'
import { prisma } from '@/lib/db'
import { createVenueSession, payments } from '@/lib/sponsorship-billing'
import { saveLead } from '@/lib/sponsorship-store'

export const dynamic = 'force-dynamic'

/** Venue placement checkout goes through the sponsorship Stripe session. No charge until Stripe says paid. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!ownershipUiEnabled()) return NextResponse.json({ error: 'These tools are turned off.' }, { status: 404 })
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const productId = String(body?.product || '')
  if (!payments().enabled) {
    if (me.email) {
      await saveLead({
        userId: me.id,
        email: me.email,
        kind: 'VENUE',
        note: 'Venue placement requested while card billing is off.',
        payload: { venueId: id, product: productId },
      }).catch(() => {})
    }
    return NextResponse.json({ payments: 'soon', charged: false, label: SPONSORED_LABEL })
  }
  const started = await startVenuePlacement(me.id, id, productId)
  if ('error' in started) return NextResponse.json({ error: started.error }, { status: started.status })
  const origin = req.headers.get('origin') || new URL(req.url).origin
  try {
    const session = await createVenueSession({
      placementId: started.placement.id,
      orderId: started.orderId,
      userId: me.id,
      email: me.email,
      amountCents: started.product.priceCents,
      title: `${started.product.name} — ${SPONSORED_LABEL}`,
      origin,
      venueId: id,
    })
    if (session.unavailable || !session.url) {
      await prisma.venuePlacement.update({ where: { id: started.placement.id }, data: { status: 'CANCELLED' } })
      return NextResponse.json({ payments: 'soon', charged: false, label: SPONSORED_LABEL })
    }
    return NextResponse.json({ url: session.url, label: SPONSORED_LABEL })
  } catch (err) {
    console.error('venue checkout failed', err instanceof Error ? err.message : err)
    await prisma.venuePlacement.update({ where: { id: started.placement.id }, data: { status: 'CANCELLED' } })
    return NextResponse.json({ error: 'Payment could not be started. Please try again.' }, { status: 502 })
  }
}
