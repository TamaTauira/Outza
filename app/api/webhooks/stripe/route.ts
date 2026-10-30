import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/db'
import { activateOrder, activatePromotion, activateProPass } from '@/lib/promotions'
import { notifyPromotionPurchased, notifyProPurchased } from '@/lib/promotion-email'
import { activateLocalAd } from '@/lib/local-ads'
import { activateVenueOrder } from '@/lib/venue-access'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secretKey || !whSecret) return NextResponse.json({ error: 'Stripe not configured' }, { status: 400 })
  const stripe = new Stripe(secretKey)
  const body = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, whSecret)
  } catch (e: any) {
    console.error('Stripe webhook signature failed:', e?.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    const session = event.data.object as Stripe.Checkout.Session
    const { orderId, promotionId, proPassId, localAdId, venueOrderId } = session?.metadata ?? {}
    if (event.type === 'checkout.session.completed' && session.payment_status === 'paid') {
      if (orderId) {
        const changed = await activateOrder(orderId)
        if (changed.length) await notifyPromotionPurchased(changed[0], orderId)
      } else if (promotionId) {
        // Legacy single-line checkouts
        const { changed } = await activatePromotion(promotionId)
        if (changed) await notifyPromotionPurchased(promotionId)
      } else if (proPassId) {
        if (await activateProPass(proPassId)) await notifyProPurchased(proPassId)
      } else if (localAdId) {
        await activateLocalAd(localAdId)
      } else if (venueOrderId) {
        await activateVenueOrder(venueOrderId)
      }
    } else if (event.type === 'checkout.session.expired') {
      if (orderId) await prisma.promotion.updateMany({ where: { orderId, status: 'PENDING' }, data: { status: 'CANCELLED' } })
      if (promotionId) await prisma.promotion.updateMany({ where: { id: promotionId, status: 'PENDING' }, data: { status: 'CANCELLED' } })
      if (proPassId) await prisma.proPass.updateMany({ where: { id: proPassId, status: 'PENDING' }, data: { status: 'CANCELLED' } })
      if (localAdId) await prisma.localAd.updateMany({ where: { id: localAdId, status: 'PENDING' }, data: { status: 'CANCELLED' } })
      if (venueOrderId) await prisma.venuePlacement.updateMany({ where: { orderId: venueOrderId, status: 'PENDING' }, data: { status: 'CANCELLED' } })
    }
  } catch (e: any) {
    console.error('Stripe webhook handling error:', e?.message)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }
  return NextResponse.json({ received: true })
}
