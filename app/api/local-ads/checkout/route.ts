import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized, forbidden, isPromoter } from '@/lib/session'
import { LOCAL_AD } from '@/lib/tiers'
import { activateLocalAd, kindLabel, validateLocalAd } from '@/lib/local-ads'

export const dynamic = 'force-dynamic'

/** body: { eventId, kind, businessName, blurb, address?, url } -> { url } (Stripe) or { activated, testMode } */
export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const body = await req.json().catch(() => ({}))
  const v = await validateLocalAd(body, me.id)
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: v.status ?? 400 })

  const secretKey = process.env.STRIPE_SECRET_KEY
  const origin = req.headers.get('origin') || new URL(req.url).origin
  const ad = await prisma.localAd.create({
    data: { ...v.data, eventId: v.event.id, promoterId: me.id, amountCents: LOCAL_AD.priceCents, paymentMode: secretKey ? 'stripe' : 'test' },
  })

  if (!secretKey) {
    await activateLocalAd(ad.id)
    return NextResponse.json({ activated: true, testMode: true, id: ad.id })
  }
  try {
    const session = await new Stripe(secretKey).checkout.sessions.create({
      mode: 'payment',
      customer_email: me.email || undefined,
      line_items: [{
        quantity: 1,
        price_data: { currency: 'aud', unit_amount: LOCAL_AD.priceCents, product_data: { name: `${LOCAL_AD.name} (${kindLabel(ad.kind)})`, description: `${ad.businessName} beneath “${v.event.title}”`.slice(0, 200) } },
      }],
      metadata: { localAdId: ad.id, eventId: v.event.id, userId: me.id },
      success_url: `${origin}/events/${v.event.id}?ad=paid`,
      cancel_url: `${origin}/events/${v.event.id}?ad=cancelled`,
    })
    await prisma.localAd.update({ where: { id: ad.id }, data: { stripeSessionId: session.id } })
    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    console.error('Stripe local-ad checkout error:', e?.message)
    await prisma.localAd.update({ where: { id: ad.id }, data: { status: 'CANCELLED' } })
    return NextResponse.json({ error: 'Payment could not be started. Please try again.' }, { status: 502 })
  }
}
