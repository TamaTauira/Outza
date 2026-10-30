import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSessionUser, unauthorized } from '@/lib/session'
import { ownershipUiEnabled, SPONSORED_LABEL } from '@/lib/ownership'
import { activateVenueOrder, startVenuePlacement } from '@/lib/venue-access'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!ownershipUiEnabled()) return NextResponse.json({ error: 'These tools are turned off.' }, { status: 404 })
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const started = await startVenuePlacement(me.id, id, String(body?.product || ''))
  if ('error' in started) return NextResponse.json({ error: started.error }, { status: started.status })
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    await activateVenueOrder(started.orderId)
    const grants = await prisma.venueManagementGrant.count({ where: { venueId: id, status: 'APPROVED' } })
    return NextResponse.json({ activated: true, testMode: true, label: SPONSORED_LABEL, grants })
  }
  const origin = req.headers.get('origin') || new URL(req.url).origin
  try {
    const session = await new Stripe(secretKey).checkout.sessions.create({
      mode: 'payment',
      customer_email: me.email || undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'aud',
          unit_amount: started.product.priceCents,
          product_data: { name: `${started.product.name} — ${SPONSORED_LABEL}`, description: `${started.product.days} days. Does not include event editing.` },
        },
      }],
      metadata: { venueOrderId: started.orderId, venueId: id, userId: me.id },
      success_url: `${origin}/venue/${id}?paid=1`,
      cancel_url: `${origin}/venue/${id}?cancelled=1`,
    })
    await prisma.venuePlacement.update({ where: { id: started.placement.id }, data: { stripeSessionId: session.id } })
    return NextResponse.json({ url: session.url, label: SPONSORED_LABEL })
  } catch (err) {
    console.error('venue checkout failed', err instanceof Error ? err.message : err)
    await prisma.venuePlacement.update({ where: { id: started.placement.id }, data: { status: 'CANCELLED' } })
    return NextResponse.json({ error: 'Payment could not be started. Please try again.' }, { status: 502 })
  }
}
