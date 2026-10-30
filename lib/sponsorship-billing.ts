import Stripe from 'stripe'
import { prisma } from '@/lib/db'
import { planDef, priceEnvForBoost, type BoostId, type PlanId, ORGANISER_PLANS, PLAN_RANK } from '@/lib/sponsorship'
import { ensureCatalog, missingTable } from '@/lib/sponsorship-store'
import { activateVenueOrder } from '@/lib/venue-access'

export function paymentsEnabled() {
  return !!process.env.STRIPE_SECRET_KEY?.trim()
}

export function planPriceId(planId: string) {
  const plan = planDef(planId)
  const value = plan ? process.env[plan.priceEnv]?.trim() : ''
  return value || null
}

export function subscriptionsEnabled() {
  return paymentsEnabled() && ORGANISER_PLANS.every((plan) => !!planPriceId(plan.id))
}

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  return key ? new Stripe(key) : null
}

function idOf(value: string | { id?: string } | null | undefined): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  return value.id ?? null
}

export interface PaymentProvider {
  enabled: boolean
  subscriptionsEnabled: boolean
}

export function payments(): PaymentProvider {
  return { enabled: paymentsEnabled(), subscriptionsEnabled: subscriptionsEnabled() }
}

async function claimEvent(eventId: string) {
  const claimed = await prisma.paymentEvent.createMany({ data: [{ id: eventId }], skipDuplicates: true })
  return claimed.count > 0
}

export async function createBoostSession(input: {
  campaignId: string
  userId: string
  email?: string | null
  amountCents: number
  title: string
  inventoryId: BoostId
  pro: boolean
  origin: string
}) {
  const stripe = stripeClient()
  if (!stripe) return { unavailable: true as const }
  const price = input.pro ? null : process.env[priceEnvForBoost(input.inventoryId)]?.trim()
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: input.email || undefined,
    line_items: [
      price
        ? { price, quantity: 1 }
        : {
            quantity: 1,
            price_data: {
              currency: 'aud',
              unit_amount: input.amountCents,
              product_data: { name: input.title },
            },
          },
    ],
    metadata: { kind: 'boost', campaignId: input.campaignId, userId: input.userId },
    success_url: `${input.origin}/promoter?tab=boosts&boost=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/promoter?tab=boosts&cancelled=1`,
  })
  await prisma.campaign.update({ where: { id: input.campaignId }, data: { stripeSessionId: session.id } })
  return { url: session.url }
}

/** Venue placement checkout. Same Stripe session path as a short boost. It does not grant event edits. */
export async function createVenueSession(input: {
  placementId: string
  orderId: string
  userId: string
  email?: string | null
  amountCents: number
  title: string
  origin: string
  venueId: string
}) {
  const stripe = stripeClient()
  if (!stripe) return { unavailable: true as const }
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: input.email || undefined,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'aud',
        unit_amount: input.amountCents,
        product_data: { name: input.title, description: 'Sponsored venue placement. Does not include editing other people’s events.' },
      },
    }],
    metadata: { kind: 'venue', venueOrderId: input.orderId, venueId: input.venueId, userId: input.userId, placementId: input.placementId },
    success_url: `${input.origin}/venue/${input.venueId}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/venue/${input.venueId}?cancelled=1`,
  })
  await prisma.venuePlacement.update({ where: { id: input.placementId }, data: { stripeSessionId: session.id, paymentMode: 'stripe' } })
  return { url: session.url }
}

export async function createPlanSession(input: {
  subscriptionId: string
  userId: string
  email?: string | null
  planId: PlanId
  origin: string
}) {
  const stripe = stripeClient()
  const price = planPriceId(input.planId)
  if (!stripe || !price) return { unavailable: true as const }
  const previous = await prisma.organiserSubscription.findFirst({
    where: { userId: input.userId, stripeCustomerId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { stripeCustomerId: true },
  })
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    ...(previous?.stripeCustomerId ? { customer: previous.stripeCustomerId } : { customer_email: input.email || undefined }),
    line_items: [{ price, quantity: 1 }],
    metadata: { kind: 'plan', subscriptionId: input.subscriptionId, userId: input.userId, planId: input.planId },
    subscription_data: {
      metadata: { subscriptionId: input.subscriptionId, userId: input.userId, planId: input.planId },
    },
    success_url: `${input.origin}/promoter?tab=billing&plan=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/promoter?tab=billing&cancelled=1`,
  })
  await prisma.organiserSubscription.update({ where: { id: input.subscriptionId }, data: { stripeSessionId: session.id } })
  return { url: session.url }
}

async function paymentIntentFromInvoice(invoice: Stripe.Invoice) {
  for (const payment of invoice.payments?.data ?? []) {
    const intent = payment.payment?.payment_intent
    const id = idOf(intent)
    if (id) return id
  }
  return null
}

async function rememberInvoice(invoice: Stripe.Invoice) {
  const details = invoice.parent?.subscription_details
  const stripeSubId = idOf(details?.subscription)
  const meta = details?.metadata ?? invoice.metadata ?? {}
  const localId = meta.subscriptionId || null
  const row = stripeSubId
    ? await prisma.organiserSubscription.findFirst({ where: { OR: [{ stripeSubscriptionId: stripeSubId }, ...(localId ? [{ id: localId }] : [])] } })
    : localId
      ? await prisma.organiserSubscription.findUnique({ where: { id: localId } })
      : null
  const invoiceId = invoice.id
  if (!row || !invoiceId || invoice.amount_paid <= 0) return
  const period = invoice.lines?.data?.[0]?.period
  await prisma.subscriptionCharge.upsert({
    where: { id: invoiceId },
    create: {
      id: invoiceId,
      subscriptionId: row.id,
      userId: row.userId,
      amountCents: invoice.amount_paid,
      status: 'PAID',
      stripePaymentIntentId: await paymentIntentFromInvoice(invoice),
      hostedUrl: invoice.hosted_invoice_url ?? null,
      periodStart: period?.start ? new Date(period.start * 1000) : row.currentPeriodStart,
      periodEnd: period?.end ? new Date(period.end * 1000) : row.currentPeriodEnd,
    },
    update: {
      amountCents: invoice.amount_paid,
      hostedUrl: invoice.hosted_invoice_url ?? undefined,
      stripePaymentIntentId: await paymentIntentFromInvoice(invoice) ?? undefined,
    },
  })
  if (period?.end) {
    await prisma.organiserSubscription.update({
      where: { id: row.id },
      data: {
        status: 'ACTIVE',
        currentPeriodStart: period.start ? new Date(period.start * 1000) : undefined,
        currentPeriodEnd: new Date(period.end * 1000),
        amountCents: invoice.amount_paid > 0 ? row.amountCents : row.amountCents,
      },
    })
  }
}

export async function applyPaidCheckout(session: Stripe.Checkout.Session) {
  if (session.payment_status !== 'paid' || session.amount_total === 0) {
    if (session.amount_total === 0) await cancelZeroCheckout(session)
    return { applied: false }
  }
  const meta = session.metadata ?? {}
  if (meta.campaignId) {
    const updated = await prisma.campaign.updateMany({
      where: { id: meta.campaignId, status: 'PENDING' },
      data: {
        status: 'ACTIVE',
        paymentMode: 'stripe',
        stripePaymentIntentId: idOf(session.payment_intent),
        ...(typeof session.amount_total === 'number' ? { amountCents: session.amount_total, spendCapCents: session.amount_total } : {}),
      },
    })
    return { applied: updated.count > 0 }
  }
  if (meta.subscriptionId) {
    const stripe = stripeClient()
    const stripeSubId = idOf(session.subscription)
    let periodStart: Date | undefined
    let periodEnd: Date | undefined
    if (stripe && stripeSubId) {
      const sub = await stripe.subscriptions.retrieve(stripeSubId)
      if (sub.status === 'trialing') {
        await stripe.subscriptions.cancel(stripeSubId)
        await prisma.organiserSubscription.updateMany({ where: { id: meta.subscriptionId, status: 'PENDING' }, data: { status: 'CANCELLED' } })
        return { applied: false }
      }
      const item = sub.items.data[0]
      if (item) {
        periodStart = new Date(item.current_period_start * 1000)
        periodEnd = new Date(item.current_period_end * 1000)
      }
    }
    await prisma.organiserSubscription.updateMany({
      where: { id: meta.subscriptionId, status: { in: ['PENDING', 'PAST_DUE'] } },
      data: {
        status: 'ACTIVE',
        paymentMode: 'stripe',
        stripeSubscriptionId: stripeSubId,
        stripeCustomerId: idOf(session.customer),
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        ...(typeof session.amount_total === 'number' ? { amountCents: session.amount_total } : {}),
      },
    })
    return { applied: true }
  }
  return { applied: false }
}

async function cancelZeroCheckout(session: Stripe.Checkout.Session) {
  const meta = session.metadata ?? {}
  if (meta.campaignId) await prisma.campaign.updateMany({ where: { id: meta.campaignId, status: 'PENDING' }, data: { status: 'CANCELLED' } })
  if (meta.subscriptionId) await prisma.organiserSubscription.updateMany({ where: { id: meta.subscriptionId, status: 'PENDING' }, data: { status: 'CANCELLED' } })
}

export async function confirmCheckoutSession(sessionId: string, userId: string) {
  const stripe = stripeClient()
  if (!stripe) return { ok: false as const, error: 'Payments are not switched on.' }
  const session = await stripe.checkout.sessions.retrieve(sessionId)
  if (session.metadata?.userId !== userId) return { ok: false as const, error: 'That checkout belongs to another account.' }
  if (session.payment_status !== 'paid') return { ok: false as const, pending: true as const }
  await applyPaidCheckout(session)
  return { ok: true as const }
}

async function syncSubscription(sub: Stripe.Subscription) {
  const stripe = stripeClient()
  if (sub.status === 'trialing' && stripe) {
    await stripe.subscriptions.cancel(sub.id)
    await prisma.organiserSubscription.updateMany({ where: { stripeSubscriptionId: sub.id }, data: { status: 'CANCELLED', cancelAtPeriodEnd: false } })
    return
  }
  const item = sub.items.data[0]
  const priceId = item?.price?.id
  const mapped = ORGANISER_PLANS.find((plan) => planPriceId(plan.id) === priceId)
  const metaPlan = planDef(sub.metadata?.planId ?? '')
  const plan = mapped ?? metaPlan
  const status = sub.status === 'active' ? 'ACTIVE' : sub.status === 'past_due' ? 'PAST_DUE' : sub.status === 'canceled' || sub.status === 'unpaid' || sub.status === 'incomplete_expired' ? 'CANCELLED' : 'PENDING'
  const where = sub.metadata?.subscriptionId
    ? { id: sub.metadata.subscriptionId }
    : null
  const data = {
    status,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: idOf(sub.customer),
    currentPeriodStart: item ? new Date(item.current_period_start * 1000) : undefined,
    currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : undefined,
    ...(plan ? { planId: plan.id, amountCents: plan.monthlyCents } : {}),
  }
  if (where) {
    await prisma.organiserSubscription.updateMany({ where: { id: where.id }, data })
    return
  }
  await prisma.organiserSubscription.updateMany({ where: { stripeSubscriptionId: sub.id }, data })
}

export async function handleSponsorshipStripeEvent(event: Stripe.Event) {
  const type = event.type
  const relevant = type === 'checkout.session.completed' || type === 'checkout.session.expired' || type === 'customer.subscription.updated' || type === 'customer.subscription.deleted' || type === 'invoice.paid' || type === 'charge.refunded'
  if (!relevant) return
  const session = event.data.object as Stripe.Checkout.Session
  const kind = session.metadata?.kind
  if ((type === 'checkout.session.completed' || type === 'checkout.session.expired') && kind !== 'boost' && kind !== 'plan' && kind !== 'venue') return
  let claimed = false
  try {
    claimed = await claimEvent(event.id)
    if (!claimed) return
    if (kind === 'venue') {
      const orderId = session.metadata?.venueOrderId
      if (orderId && type === 'checkout.session.completed' && session.payment_status === 'paid') await activateVenueOrder(orderId)
      if (orderId && type === 'checkout.session.expired') {
        await prisma.venuePlacement.updateMany({ where: { orderId, status: 'PENDING' }, data: { status: 'CANCELLED' } })
      }
      return
    }
    if (type === 'checkout.session.completed') await applyPaidCheckout(session)
    if (type === 'checkout.session.expired') await cancelZeroCheckout(session)
    if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
      await syncSubscription(event.data.object as Stripe.Subscription)
    }
    if (type === 'invoice.paid') await rememberInvoice(event.data.object as Stripe.Invoice)
    if (type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge
      const intent = idOf(charge.payment_intent)
      if (intent) {
        await prisma.campaign.updateMany({ where: { stripePaymentIntentId: intent, status: { not: 'REFUNDED' } }, data: { status: 'REFUNDED', refundedAt: new Date() } })
        await prisma.subscriptionCharge.updateMany({ where: { stripePaymentIntentId: intent, status: 'PAID' }, data: { status: 'REFUNDED' } })
      }
    }
  } catch (error) {
    if (claimed) await prisma.paymentEvent.delete({ where: { id: event.id } }).catch(() => {})
    if (missingTable(error)) {
      console.error('[sponsorship] tables missing; webhook left for a retry after the SQL migration')
      return
    }
    throw error
  }
}

export async function changePlan(userId: string, planId: PlanId, consent: boolean) {
  const stripe = stripeClient()
  const price = planPriceId(planId)
  const next = planDef(planId)
  if (!stripe || !price || !next) return { unavailable: true as const }
  const current = await prisma.organiserSubscription.findFirst({ where: { userId, status: 'ACTIVE' }, orderBy: { amountCents: 'desc' } })
  if (!current?.stripeSubscriptionId) return { needsCheckout: true as const }
  if (current.planId === planId) {
    await prisma.organiserSubscription.update({ where: { id: current.id }, data: { pendingPlanId: null, pendingPlanAt: null } })
    return { ok: true as const, unchanged: true as const }
  }
  const upgrade = PLAN_RANK[planId] > PLAN_RANK[current.planId as PlanId]
  if (upgrade && !consent) return { error: 'Tick the box. An upgrade charges the difference now, and there is no free trial.' }
  if (!upgrade) {
    await prisma.organiserSubscription.update({
      where: { id: current.id },
      data: { pendingPlanId: planId, pendingPlanAt: current.currentPeriodEnd ?? new Date() },
    })
    return { ok: true as const, when: 'period-end' as const }
  }
  const sub = await stripe.subscriptions.retrieve(current.stripeSubscriptionId)
  const item = sub.items.data[0]
  if (!item) return { error: 'Stripe could not find the current plan.' }
  const updated = await stripe.subscriptions.update(current.stripeSubscriptionId, {
    items: [{ id: item.id, price }],
    proration_behavior: 'always_invoice',
    payment_behavior: 'pending_if_incomplete',
    metadata: { ...sub.metadata, planId, subscriptionId: current.id, userId },
  })
  if (updated.pending_update) {
    const invoiceId = idOf(updated.latest_invoice)
    const invoice = invoiceId ? await stripe.invoices.retrieve(invoiceId) : null
    return { ok: true as const, pendingPayment: true as const, url: invoice?.hosted_invoice_url ?? null }
  }
  await prisma.organiserSubscription.update({
    where: { id: current.id },
    data: { planId, amountCents: next.monthlyCents, pendingPlanId: null, pendingPlanAt: null },
  })
  return { ok: true as const, when: 'now' as const }
}

export async function cancelPlan(userId: string) {
  const stripe = stripeClient()
  const current = await prisma.organiserSubscription.findFirst({ where: { userId, status: 'ACTIVE' }, orderBy: { amountCents: 'desc' } })
  if (!current) return { error: 'No live plan to cancel.' }
  if (stripe && current.stripeSubscriptionId) {
    await stripe.subscriptions.update(current.stripeSubscriptionId, { cancel_at_period_end: true })
  }
  await prisma.organiserSubscription.update({ where: { id: current.id }, data: { cancelAtPeriodEnd: true, pendingPlanId: null, pendingPlanAt: null } })
  return { ok: true as const, until: current.currentPeriodEnd }
}

export async function refundCampaign(userId: string, campaignId: string) {
  const stripe = stripeClient()
  const row = await prisma.campaign.findFirst({ where: { id: campaignId, promoterId: userId } })
  if (!row || !stripe || !row.stripePaymentIntentId) return { error: 'There is no card charge to refund.' }
  await stripe.refunds.create({ payment_intent: row.stripePaymentIntentId })
  await prisma.campaign.update({ where: { id: row.id }, data: { status: 'REFUNDED', refundedAt: new Date() } })
  return { ok: true as const }
}

export async function refundSubscription(userId: string) {
  const stripe = stripeClient()
  const current = await prisma.organiserSubscription.findFirst({
    where: { userId, status: 'ACTIVE' },
    orderBy: { amountCents: 'desc' },
    include: { charges: { where: { status: 'PAID' }, orderBy: { createdAt: 'desc' }, take: 1 } },
  })
  const charge = current?.charges[0]
  if (!current || !stripe || !current.stripeSubscriptionId || !charge?.stripePaymentIntentId) {
    return { error: 'There is no card charge to refund.' }
  }
  await stripe.refunds.create({ payment_intent: charge.stripePaymentIntentId })
  await stripe.subscriptions.cancel(current.stripeSubscriptionId)
  await prisma.$transaction([
    prisma.subscriptionCharge.update({ where: { id: charge.id }, data: { status: 'REFUNDED' } }),
    prisma.organiserSubscription.update({
      where: { id: current.id },
      data: { status: 'CANCELLED', cancelAtPeriodEnd: false, currentPeriodEnd: new Date(), pendingPlanId: null, pendingPlanAt: null },
    }),
  ])
  return { ok: true as const }
}

export async function applyDueDowngrades(now = new Date()) {
  const stripe = stripeClient()
  if (!stripe) return { applied: 0 }
  const due = await prisma.organiserSubscription.findMany({
    where: { status: 'ACTIVE', pendingPlanId: { not: null }, pendingPlanAt: { lte: now }, stripeSubscriptionId: { not: null } },
  })
  let applied = 0
  for (const row of due) {
    const plan = planDef(row.pendingPlanId ?? '')
    const price = plan ? planPriceId(plan.id) : null
    if (!plan || !price || !row.stripeSubscriptionId) continue
    try {
      const sub = await stripe.subscriptions.retrieve(row.stripeSubscriptionId)
      const item = sub.items.data[0]
      if (!item) continue
      await stripe.subscriptions.update(row.stripeSubscriptionId, {
        items: [{ id: item.id, price }],
        proration_behavior: 'none',
        metadata: { ...sub.metadata, planId: plan.id, subscriptionId: row.id, userId: row.userId },
      })
      await prisma.organiserSubscription.update({
        where: { id: row.id },
        data: { planId: plan.id, amountCents: plan.monthlyCents, pendingPlanId: null, pendingPlanAt: null },
      })
      applied += 1
    } catch (error) {
      console.error('[sponsorship] downgrade retry', row.id, error)
    }
  }
  return { applied }
}

export async function prepareCatalog() {
  try {
    await ensureCatalog()
    return true
  } catch (error) {
    if (!missingTable(error)) console.error('[sponsorship] catalogue', error)
    return false
  }
}
