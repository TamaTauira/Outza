import { NextResponse } from 'next/server'
import crypto from 'crypto'
import Stripe from 'stripe'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized, forbidden, isPromoter } from '@/lib/session'
import { PRO_PLAN, isAddon, isDuration, isTier, quote, type Addon } from '@/lib/tiers'
import { activateOrder, activateProPass, isProActive } from '@/lib/promotions'
import { notifyPromotionPurchased, notifyProPurchased } from '@/lib/promotion-email'

export const dynamic = 'force-dynamic'

/**
 * body: { eventId, tier, days?, addons?: string[] }  -> campaign checkout
 *    or { plan: 'PRO' }                              -> Promoter Pro (30-day pass)
 * returns { url } (Stripe Checkout) or { activated: true, testMode: true } when Stripe isn't configured.
 */
export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const body = await req.json().catch(() => ({}))
  const secretKey = process.env.STRIPE_SECRET_KEY
  const origin = req.headers.get('origin') || new URL(req.url).origin

  if (body?.plan === 'PRO') {
    const pass = await prisma.proPass.create({ data: { userId: me.id, amountCents: PRO_PLAN.priceCents, paymentMode: secretKey ? 'stripe' : 'test' } })
    if (!secretKey) {
      await activateProPass(pass.id)
      await notifyProPurchased(pass.id)
      return NextResponse.json({ activated: true, testMode: true })
    }
    try {
      const session = await new Stripe(secretKey).checkout.sessions.create({
        mode: 'payment',
        customer_email: me.email || undefined,
        line_items: [{ quantity: 1, price_data: { currency: 'aud', unit_amount: PRO_PLAN.priceCents, product_data: { name: `${PRO_PLAN.name} — ${PRO_PLAN.days} days` } } }],
        metadata: { proPassId: pass.id, userId: me.id },
        success_url: `${origin}/promoter?pro=1`,
        cancel_url: `${origin}/promoter?cancelled=1`,
      })
      await prisma.proPass.update({ where: { id: pass.id }, data: { stripeSessionId: session.id } })
      return NextResponse.json({ url: session.url })
    } catch (e: any) {
      console.error('Stripe Pro checkout error:', e?.message)
      await prisma.proPass.update({ where: { id: pass.id }, data: { status: 'CANCELLED' } })
      return NextResponse.json({ error: 'Payment could not be started. Please try again.' }, { status: 502 })
    }
  }

  const { eventId, tier } = body ?? {}
  const days = isDuration(Number(body?.days)) ? (Number(body.days) as 7 | 14 | 30) : 30
  const addons: Addon[] = Array.isArray(body?.addons) ? [...new Set<Addon>(body.addons.filter(isAddon))] : []
  if (!isTier(tier)) return NextResponse.json({ error: 'Choose a package' }, { status: 400 })
  const event = typeof eventId === 'string' ? await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, title: true, promoterId: true } }) : null
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (event.promoterId !== me.id && me.role !== 'ADMIN') return NextResponse.json({ error: 'Add this event to your dashboard first' }, { status: 403 })

  const user = await prisma.user.findUnique({ where: { id: me.id }, select: { proUntil: true } })
  const q = quote(tier, days, addons, isProActive(user?.proUntil))
  const orderId = crypto.randomUUID()
  const paymentMode = secretKey ? 'stripe' : 'test'
  await prisma.promotion.createMany({
    data: q.lines.map((l) => ({ eventId: event.id, promoterId: me.id, tier: l.key, days, orderId, amountCents: l.cents, currency: 'aud', paymentMode })),
  })

  // No Stripe keys yet: activate immediately in test mode (no money is taken)
  if (!secretKey) {
    const changed = await activateOrder(orderId)
    if (changed.length) await notifyPromotionPurchased(changed[0], orderId)
    return NextResponse.json({ activated: true, testMode: true })
  }

  try {
    const session = await new Stripe(secretKey).checkout.sessions.create({
      mode: 'payment',
      customer_email: me.email || undefined,
      line_items: q.lines.map((l) => ({
        quantity: 1,
        price_data: { currency: 'aud', unit_amount: l.cents, product_data: { name: `${l.name} — ${days} days`, description: event.title.slice(0, 200) } },
      })),
      metadata: { orderId, eventId: event.id, tier, userId: me.id },
      success_url: `${origin}/promoter?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/promoter?cancelled=1`,
    })
    // stripeSessionId is unique, so store it on the package line only
    const main = await prisma.promotion.findFirst({ where: { orderId, tier }, select: { id: true } })
    if (main) await prisma.promotion.update({ where: { id: main.id }, data: { stripeSessionId: session.id } })
    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    console.error('Stripe checkout error:', e?.message)
    await prisma.promotion.updateMany({ where: { orderId }, data: { status: 'CANCELLED' } })
    return NextResponse.json({ error: 'Payment could not be started. Please try again.' }, { status: 502 })
  }
}
