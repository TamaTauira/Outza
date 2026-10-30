import { createHash } from 'crypto'
import { prisma } from '@/lib/db'
import { imageAssetSelect } from '@/lib/images/spec'
import { BOOSTS, ORGANISER_PLANS, type PlanId } from '@/lib/sponsorship'
import {
  ATTRIBUTION_NOTE,
  boostSlots,
  canExportCampaigns,
  canPauseBoosts,
  expireReason,
  impressionBucket,
  planDef,
  refundEligible,
  refundWindowHours,
  scheduleHorizonDays,
} from '@/lib/sponsorship'

export function missingTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'P2021' || code === 'P2022'
}

export async function ensureCatalog() {
  for (const boost of Object.values(BOOSTS)) {
    await prisma.placementInventory.upsert({
      where: { id: boost.id },
      create: { ...boost },
      update: {
        name: boost.name,
        priceCents: boost.priceCents,
        impressionCap: boost.impressionCap,
        minMinutes: boost.minMinutes,
        maxMinutes: boost.maxMinutes,
        guaranteed: boost.guaranteed,
        estimated: boost.estimated,
        active: true,
      },
    })
  }
  for (const plan of ORGANISER_PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { id: plan.id },
      create: { id: plan.id, name: plan.name, monthlyCents: plan.monthlyCents, features: [...plan.features] },
      update: { name: plan.name, monthlyCents: plan.monthlyCents, features: [...plan.features], active: true },
    })
  }
}

export async function activePlan(userId: string) {
  return prisma.organiserSubscription.findFirst({
    where: { userId, status: 'ACTIVE' },
    orderBy: { amountCents: 'desc' },
    include: { plan: true },
  })
}

export function planKeyOf(sub: { planId: string; status: string; currentPeriodEnd: Date | null } | null): PlanId | null {
  if (!sub || sub.status !== 'ACTIVE') return null
  if (sub.currentPeriodEnd && sub.currentPeriodEnd <= new Date()) return null
  return planDef(sub.planId)?.id ?? null
}

export async function holdingBoostCount(promoterId: string) {
  const now = new Date()
  const [pending, live] = await Promise.all([
    prisma.campaign.count({
      where: { promoterId, status: 'PENDING', createdAt: { gt: new Date(now.getTime() - 2 * 3600000) } },
    }),
    prisma.campaign.count({
      where: { promoterId, status: { in: ['ACTIVE', 'PAUSED'] }, endsAt: { gt: now } },
    }),
  ])
  return pending + live
}

export async function liveBoostEventIds(eventIds: string[]): Promise<Set<string>> {
  if (!eventIds.length) return new Set()
  try {
    const now = new Date()
    const rows = await prisma.campaign.findMany({
      where: { eventId: { in: eventIds }, status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } },
      select: { eventId: true, impressionCap: true, id: true },
    })
    if (!rows.length) return new Set()
    const sums = await impressionTotals(rows.map((row) => row.id))
    return new Set(rows.filter((row) => (sums.get(row.id) ?? 0) < row.impressionCap).map((row) => row.eventId))
  } catch (error) {
    if (!missingTable(error)) console.error('[sponsorship] live boosts', error)
    return new Set()
  }
}

export async function impressionTotals(campaignIds: string[]) {
  const map = new Map<string, number>()
  if (!campaignIds.length) return map
  const sums = await prisma.impression.groupBy({
    by: ['campaignId'],
    where: { campaignId: { in: campaignIds } },
    _sum: { count: true },
  })
  for (const row of sums) map.set(row.campaignId, row._sum.count ?? 0)
  return map
}

export async function recordImpressions(campaignIds: string[], surface: string, now = new Date()) {
  const unique = [...new Set(campaignIds)].slice(0, 20)
  if (!unique.length) return
  const bucket = impressionBucket(now)
  try {
    await Promise.all(unique.map((campaignId) => prisma.impression.upsert({
      where: { campaignId_surface_bucket: { campaignId, surface, bucket } },
      create: { campaignId, surface, bucket, count: 1 },
      update: { count: { increment: 1 } },
    })))
    const totals = await impressionTotals(unique)
    const hit = unique.filter((id) => {
      const cap = totals.get(id)
      return cap != null
    })
    if (!hit.length) return
    const rows = await prisma.campaign.findMany({
      where: { id: { in: hit }, status: 'ACTIVE' },
      select: { id: true, impressionCap: true, endsAt: true, status: true },
    })
    const expire = rows.filter((row) => expireReason(row, totals.get(row.id) ?? 0, now)).map((row) => row.id)
    if (expire.length) {
      await prisma.campaign.updateMany({ where: { id: { in: expire }, status: 'ACTIVE' }, data: { status: 'EXPIRED' } })
    }
  } catch (error) {
    if (!missingTable(error)) console.error('[sponsorship] impressions', error)
  }
}

function actorHash(userId: string) {
  return createHash('sha256').update(userId).digest('hex').slice(0, 32)
}

export async function recordCampaignConversion(eventId: string, kind: 'DETAIL' | 'TICKET', userId?: string | null) {
  try {
    const now = new Date()
    const campaigns = await prisma.campaign.findMany({
      where: { eventId, status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } },
      select: { id: true, promoterId: true },
    })
    const visible = campaigns.filter((row) => !userId || row.promoterId !== userId)
    if (!visible.length) return
    const hash = userId ? actorHash(userId) : null
    for (const campaign of visible) {
      await prisma.conversionEvent.create({ data: { campaignId: campaign.id, kind, actorHash: hash } })
      if (kind === 'TICKET' && hash) {
        const prior = await prisma.conversionEvent.findFirst({
          where: {
            kind: 'TICKET',
            actorHash: hash,
            createdAt: { gte: new Date(now.getTime() - 90 * 86400000) },
            campaign: { promoterId: campaign.promoterId, id: { not: campaign.id } },
          },
          select: { id: true },
        })
        if (prior) await prisma.conversionEvent.create({ data: { campaignId: campaign.id, kind: 'REPEAT', actorHash: hash } })
      }
    }
  } catch (error) {
    if (!missingTable(error)) console.error('[sponsorship] conversion', error)
  }
}

export async function endExpiredBoosts(now = new Date()) {
  const ended = await prisma.campaign.updateMany({
    where: { status: { in: ['ACTIVE', 'PAUSED'] }, endsAt: { lte: now } },
    data: { status: 'EXPIRED' },
  })
  const abandoned = await prisma.campaign.updateMany({
    where: { status: 'PENDING', createdAt: { lt: new Date(now.getTime() - 2 * 3600000) } },
    data: { status: 'CANCELLED' },
  })
  const active = await prisma.campaign.findMany({
    where: { status: { in: ['ACTIVE', 'PAUSED'] }, endsAt: { gt: now } },
    select: { id: true, impressionCap: true, endsAt: true, status: true },
  })
  let capped = 0
  if (active.length) {
    const totals = await impressionTotals(active.map((row) => row.id))
    const hit = active.filter((row) => expireReason(row, totals.get(row.id) ?? 0, now) === 'capped').map((row) => row.id)
    if (hit.length) {
      const res = await prisma.campaign.updateMany({
        where: { id: { in: hit }, status: { in: ['ACTIVE', 'PAUSED'] } },
        data: { status: 'EXPIRED' },
      })
      capped = res.count
    }
  }
  return { ended: ended.count, abandoned: abandoned.count, capped }
}

export async function listPromoterCampaigns(promoterId: string, pro: boolean) {
  const sub = await activePlan(promoterId).catch((error) => {
    if (missingTable(error)) return null
    throw error
  })
  const plan = planKeyOf(sub)
  const campaigns = await prisma.campaign.findMany({
    where: { promoterId, status: { not: 'CANCELLED' } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      creative: true,
      event: { select: { id: true, title: true } },
      inventory: { select: { id: true, name: true } },
    },
  })
  const ids = campaigns.map((row) => row.id)
  const [impressions, conversions] = await Promise.all([
    impressionTotals(ids),
    ids.length
      ? prisma.conversionEvent.groupBy({ by: ['campaignId', 'kind'], where: { campaignId: { in: ids } }, _count: { _all: true } })
      : Promise.resolve([]),
  ])
  const counts = new Map<string, { DETAIL: number; TICKET: number; REPEAT: number }>()
  for (const row of conversions) {
    const cur = counts.get(row.campaignId) ?? { DETAIL: 0, TICKET: 0, REPEAT: 0 }
    if (row.kind === 'DETAIL' || row.kind === 'TICKET' || row.kind === 'REPEAT') cur[row.kind] = row._count._all
    counts.set(row.campaignId, cur)
  }
  const windowHours = refundWindowHours(plan)
  const now = new Date()
  return {
    plan: sub ? {
      id: sub.planId,
      name: sub.plan.name,
      status: sub.status,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      currentPeriodEnd: sub.currentPeriodEnd,
      pendingPlanId: sub.pendingPlanId,
      pendingPlanAt: sub.pendingPlanAt,
    } : null,
    slots: boostSlots(plan),
    used: await holdingBoostCount(promoterId),
    horizonDays: scheduleHorizonDays(plan),
    refundWindowHours: windowHours,
    canExport: canExportCampaigns(plan),
    canPause: canPauseBoosts(plan),
    pro,
    attribution: ATTRIBUTION_NOTE,
    campaigns: campaigns.map((row) => {
      const shown = impressions.get(row.id) ?? 0
      const conv = counts.get(row.id) ?? { DETAIL: 0, TICKET: 0, REPEAT: 0 }
      const refund = refundEligible({
        status: row.status,
        impressions: shown,
        startsAt: row.startsAt,
        now,
        windowHours,
        paymentMode: row.paymentMode,
        hasPaymentIntent: !!row.stripePaymentIntentId,
      })
      return {
        id: row.id,
        status: row.status,
        inventoryId: row.inventoryId,
        inventoryName: row.inventory.name,
        eventId: row.event.id,
        eventTitle: row.event.title,
        city: row.city,
        category: row.category,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        impressionCap: row.impressionCap,
        impressions: shown,
        detailViews: conv.DETAIL,
        ticketClicks: conv.TICKET,
        repeatInterest: conv.REPEAT,
        amountCents: row.amountCents,
        spendCapCents: row.spendCapCents,
        paymentMode: row.paymentMode,
        headline: row.creative?.headline ?? '',
        blurb: row.creative?.blurb ?? '',
        refundable: refund.ok,
        refundReason: refund.ok ? '' : refund.reason,
        createdAt: row.createdAt,
      }
    }),
  }
}

export async function featuredBoosts(city: string, today: Date) {
  const now = new Date()
  const rows = await prisma.campaign.findMany({
    where: {
      status: 'ACTIVE',
      startsAt: { lte: now },
      endsAt: { gt: now },
      event: { date: { gte: today }, duplicateOfId: null },
      ...(city ? { city } : {}),
    },
    take: 40,
    select: {
      id: true,
      impressionCap: true,
      inventoryId: true,
      creative: { select: { headline: true } },
      event: {
        select: {
          id: true, title: true, date: true, endDate: true, time: true, endTime: true, venueName: true, suburb: true, city: true,
          category: true, isFree: true, price: true, priceMin: true, priceMax: true, imageUrl: true,
          latitude: true, longitude: true, status: true, duplicateOfId: true, allDay: true, startsAt: true, endsAt: true,
          promoter: { select: { id: true, orgName: true, name: true } },
          imageAsset: { select: imageAssetSelect },
        },
      },
    },
  })
  if (!rows.length) return []
  const totals = await impressionTotals(rows.map((row) => row.id))
  return rows
    .filter((row) => (totals.get(row.id) ?? 0) < row.impressionCap)
    .map((row) => ({
      ...row.event,
      tier: row.inventoryId,
      frontRow: false,
      sponsored: true,
      campaignId: row.id,
      creative: row.creative?.headline ?? null,
    }))
}

export async function saveLead(input: { userId?: string | null; email: string; kind: 'BOOST' | 'PLAN'; note?: string | null; payload: unknown }) {
  const recent = await prisma.sponsorshipLead.findFirst({
    where: { email: input.email, kind: input.kind, createdAt: { gt: new Date(Date.now() - 10 * 60000) } },
    select: { id: true },
  })
  if (recent) return recent.id
  const row = await prisma.sponsorshipLead.create({
    data: {
      userId: input.userId || null,
      email: input.email,
      kind: input.kind,
      note: input.note || null,
      payload: input.payload as object,
    },
    select: { id: true },
  })
  return row.id
}

export async function sponsorshipInvoice(id: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: { event: { select: { title: true } }, inventory: { select: { name: true } }, promoter: { select: { name: true, orgName: true, email: true } } },
  })
  if (campaign && campaign.status !== 'PENDING' && campaign.status !== 'CANCELLED') {
    return {
      ownerId: campaign.promoterId,
      buyer: { name: campaign.promoter.orgName || campaign.promoter.name || '', email: campaign.promoter.email ?? '' },
      lines: [{ label: campaign.inventory.name, detail: `${campaign.event.title} · ${campaign.city} · ${campaign.category}`, cents: campaign.amountCents }],
      issued: campaign.createdAt,
      test: false,
      status: campaign.status === 'REFUNDED' ? 'Refunded' : 'Paid',
    }
  }
  const charge = await prisma.subscriptionCharge.findUnique({
    where: { id },
    include: { subscription: { include: { plan: true, user: { select: { name: true, orgName: true, email: true } } } } },
  })
  if (!charge) return null
  const user = charge.subscription.user
  return {
    ownerId: charge.userId,
    buyer: { name: user.orgName || user.name || '', email: user.email ?? '' },
    lines: [{
      label: `${charge.subscription.plan.name} monthly`,
      detail: charge.periodStart && charge.periodEnd ? `${charge.periodStart.toISOString().slice(0, 10)} to ${charge.periodEnd.toISOString().slice(0, 10)}` : 'Monthly plan',
      cents: charge.amountCents,
    }],
    issued: charge.createdAt,
    test: false,
    status: charge.status === 'REFUNDED' ? 'Refunded' : 'Paid',
  }
}
