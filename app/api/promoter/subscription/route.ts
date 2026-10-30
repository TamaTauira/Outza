import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized, forbidden, isPromoter } from '@/lib/session'
import { ORGANISER_PLANS, isPlanId, refundEligible, refundWindowHours } from '@/lib/sponsorship'
import { cancelPlan, changePlan, createPlanSession, payments, planPriceId, prepareCatalog, refundSubscription } from '@/lib/sponsorship-billing'
import { activePlan, missingTable, planKeyOf } from '@/lib/sponsorship-store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const gate = payments()
  try {
    await prepareCatalog()
    const [current, charges] = await Promise.all([
      activePlan(me.id),
      prisma.subscriptionCharge.findMany({ where: { userId: me.id }, orderBy: { createdAt: 'desc' }, take: 24 }),
    ])
    const shown = await prisma.impression.aggregate({
      where: {
        campaign: { promoterId: me.id },
        ...(current?.currentPeriodStart ? { bucket: { gte: current.currentPeriodStart.toISOString().slice(0, 13) } } : {}),
      },
      _sum: { count: true },
    })
    const plan = planKeyOf(current)
    const latest = charges[0]
    const refund = current && latest ? refundEligible({
      status: current.status,
      impressions: shown._sum.count ?? 0,
      startsAt: current.currentPeriodStart,
      now: new Date(),
      windowHours: refundWindowHours(plan),
      paymentMode: current.paymentMode,
      hasPaymentIntent: !!latest.stripePaymentIntentId,
    }) : { ok: false as const, reason: 'A refund is available after the first paid invoice, and only if no boost has been shown in this period.' }
    return NextResponse.json({
      paymentsEnabled: gate.enabled,
      subscriptionsEnabled: gate.subscriptionsEnabled,
      plan: current ? {
        id: current.planId,
        name: current.plan.name,
        status: current.status,
        amountCents: current.amountCents,
        cancelAtPeriodEnd: current.cancelAtPeriodEnd,
        pendingPlanId: current.pendingPlanId,
        pendingPlanAt: current.pendingPlanAt,
        currentPeriodStart: current.currentPeriodStart,
        currentPeriodEnd: current.currentPeriodEnd,
      } : null,
      plans: ORGANISER_PLANS.map((row) => ({ ...row, priceConfigured: !!planPriceId(row.id) })),
      charges: charges.map((row) => ({
        id: row.id,
        amountCents: row.amountCents,
        status: row.status,
        createdAt: row.createdAt,
        hostedUrl: row.hostedUrl,
      })),
      refund: refund.ok ? { eligible: true, reason: '' } : { eligible: false, reason: refund.reason },
    })
  } catch (error) {
    if (missingTable(error)) {
      return NextResponse.json({
        paymentsEnabled: gate.enabled,
        subscriptionsEnabled: gate.subscriptionsEnabled,
        ready: false,
        plan: null,
        plans: ORGANISER_PLANS.map((row) => ({ ...row, priceConfigured: !!planPriceId(row.id) })),
        charges: [],
        refund: { eligible: false, reason: 'Plans are not switched on yet.' },
      })
    }
    console.error('[sponsorship] subscription', error)
    return NextResponse.json({ error: 'Could not load your plan.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const body = await req.json().catch(() => ({}))
  const action = body?.action
  try {
    if (action === 'cancel') {
      const result = await cancelPlan(me.id)
      if ('error' in result) return NextResponse.json({ error: result.error }, { status: 409 })
      return NextResponse.json(result)
    }
    if (action === 'refund') {
      if (body?.consent !== true) return NextResponse.json({ error: 'Tick the box to confirm the refund.' }, { status: 400 })
      const view = await GET()
      const payload = await view.json()
      if (!payload?.refund?.eligible) return NextResponse.json({ error: payload?.refund?.reason ?? 'This plan cannot be refunded here.' }, { status: 409 })
      const result = await refundSubscription(me.id)
      if ('error' in result) return NextResponse.json({ error: result.error }, { status: 409 })
      return NextResponse.json(result)
    }
    if (action !== 'checkout' && action !== 'change') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
    if (!isPlanId(body?.planId)) return NextResponse.json({ error: 'Choose Local Pro, Growth, or Venue Plus.' }, { status: 400 })
    if (!payments().subscriptionsEnabled) return NextResponse.json({ payments: 'soon', charged: false })
    await prepareCatalog()
    const current = await activePlan(me.id)
    if (current) {
      const changed = await changePlan(me.id, body.planId, body?.consent === true)
      if ('unavailable' in changed) return NextResponse.json({ payments: 'soon', charged: false })
      if ('needsCheckout' in changed) {
        return NextResponse.json({ error: 'This plan is not linked to a card yet. Request a quote and we will sort it. Nothing has been charged.' }, { status: 409 })
      }
      if ('error' in changed) return NextResponse.json({ error: changed.error }, { status: 400 })
      return NextResponse.json(changed)
    }
    if (body?.consent !== true) {
      return NextResponse.json({ error: 'Tick the box. The plan charges today and then monthly until you cancel. There is no free trial.' }, { status: 400 })
    }
    const plan = ORGANISER_PLANS.find((row) => row.id === body.planId)!
    const pending = await prisma.organiserSubscription.create({
      data: { userId: me.id, planId: plan.id, amountCents: plan.monthlyCents, consentAt: new Date(), paymentMode: 'stripe' },
    })
    const origin = req.headers.get('origin') || new URL(req.url).origin
    try {
      const session = await createPlanSession({
        subscriptionId: pending.id,
        userId: me.id,
        email: me.email,
        planId: plan.id,
        origin,
      })
      if (!('url' in session) || !session.url) {
        await prisma.organiserSubscription.update({ where: { id: pending.id }, data: { status: 'CANCELLED' } })
        return NextResponse.json({ payments: 'soon', charged: false })
      }
      return NextResponse.json({ url: session.url, charged: false })
    } catch (error) {
      console.error('[sponsorship] plan checkout', error)
      await prisma.organiserSubscription.update({ where: { id: pending.id }, data: { status: 'CANCELLED' } }).catch(() => {})
      return NextResponse.json({ error: 'Payment could not be started. Nothing was charged.' }, { status: 502 })
    }
  } catch (error) {
    if (missingTable(error)) return NextResponse.json({ error: 'Plans are not switched on yet.' }, { status: 503 })
    console.error('[sponsorship] subscription action', error)
    return NextResponse.json({ error: 'Could not update the plan.' }, { status: 500 })
  }
}
