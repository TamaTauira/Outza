import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized, forbidden, isPromoter } from '@/lib/session'
import { isProActive } from '@/lib/promotions'
import { planBoost } from '@/lib/sponsorship'
import { createBoostSession, payments, prepareCatalog } from '@/lib/sponsorship-billing'
import { activePlan, holdingBoostCount, missingTable, planKeyOf } from '@/lib/sponsorship-store'
import { scheduleHorizonDays, boostSlots } from '@/lib/sponsorship'

export const dynamic = 'force-dynamic'

/**
 * Starts a short-boost checkout. With no Stripe secret this does not create a campaign and does not charge.
 * The campaign stays PENDING until Stripe reports payment_status=paid.
 */
export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const body = await req.json().catch(() => ({}))
  if (!payments().enabled) {
    return NextResponse.json({ payments: 'soon', charged: false })
  }
  const eventId = typeof body?.eventId === 'string' ? body.eventId : ''
  const event = eventId
    ? await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, title: true, city: true, category: true, date: true, promoterId: true } })
    : null
  if (!event) return NextResponse.json({ error: 'Choose an event you look after.' }, { status: 404 })
  if (event.promoterId !== me.id && me.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Add this event to your dashboard before boosting it.' }, { status: 403 })
  }
  let ready = false
  try {
    ready = await prepareCatalog()
    if (!ready) return NextResponse.json({ error: 'Short boosts are not switched on yet.' }, { status: 503 })
    const [user, sub, used] = await Promise.all([
      prisma.user.findUnique({ where: { id: me.id }, select: { proUntil: true } }),
      activePlan(me.id),
      holdingBoostCount(me.id),
    ])
    const plan = planKeyOf(sub)
    const pro = isProActive(user?.proUntil)
    const planned = planBoost(body, event, { now: new Date(), pro, horizonDays: scheduleHorizonDays(plan) })
    if (!planned.ok) return NextResponse.json({ error: planned.error }, { status: 400 })
    const slots = boostSlots(plan)
    if (used >= slots) {
      return NextResponse.json({ error: `Your plan holds ${slots} short boost${slots === 1 ? '' : 's'} at a time. End one, or move up a plan.` }, { status: 409 })
    }
    const recent = await prisma.campaign.findFirst({
      where: { promoterId: me.id, eventId: event.id, inventoryId: planned.value.inventoryId, createdAt: { gt: new Date(Date.now() - 90_000) }, status: { in: ['PENDING', 'ACTIVE'] } },
      select: { id: true },
    })
    if (recent) return NextResponse.json({ error: 'That boost was just started. Refresh before buying it again.' }, { status: 409 })
    const campaign = await prisma.campaign.create({
      data: {
        promoterId: me.id,
        eventId: event.id,
        inventoryId: planned.value.inventoryId,
        city: planned.value.city,
        category: planned.value.category,
        startsAt: planned.value.startsAt,
        endsAt: planned.value.endsAt,
        impressionCap: planned.value.impressionCap,
        spendCapCents: planned.value.spendCapCents,
        amountCents: planned.value.amountCents,
        paymentMode: 'stripe',
        consentAt: new Date(),
        creative: { create: { headline: planned.value.headline, blurb: planned.value.blurb } },
      },
    })
    const origin = req.headers.get('origin') || new URL(req.url).origin
    try {
      const session = await createBoostSession({
        campaignId: campaign.id,
        userId: me.id,
        email: me.email,
        amountCents: planned.value.amountCents,
        title: `${planned.value.inventoryId === 'EVENING' ? 'Evening pass' : 'Day pass'} — ${event.title}`.slice(0, 120),
        inventoryId: planned.value.inventoryId,
        pro,
        origin,
      })
      if (!('url' in session) || !session.url) {
        await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'CANCELLED' } })
        return NextResponse.json({ payments: 'soon', charged: false })
      }
      return NextResponse.json({ url: session.url, charged: false })
    } catch (error) {
      console.error('[sponsorship] checkout', error)
      await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'CANCELLED' } }).catch(() => {})
      return NextResponse.json({ error: 'Payment could not be started. Nothing was charged.' }, { status: 502 })
    }
  } catch (error) {
    if (missingTable(error) || !ready) return NextResponse.json({ error: 'Short boosts are not switched on yet.' }, { status: 503 })
    console.error('[sponsorship] checkout', error)
    return NextResponse.json({ error: 'Could not start that boost.' }, { status: 500 })
  }
}
