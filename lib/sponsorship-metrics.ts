import { prisma } from '@/lib/db'
import { monthlyRecurringRevenue, placementMargin, repeatPurchase90d } from '@/lib/sponsorship'

/** Admin counters: paying organisers, 90-day repeat purchase, MRR, placement gross margin. */
export async function sponsorshipMetrics(now = new Date()) {
  const since = new Date(now.getTime() - 90 * 86400000)
  const [campaigns, promotions, subs, activeBoosts, activePackages, leads] = await Promise.all([
    prisma.campaign.findMany({
      where: { paymentMode: 'stripe', status: { in: ['ACTIVE', 'EXPIRED', 'REFUNDED'] } },
      select: { promoterId: true, createdAt: true, amountCents: true, paymentMode: true, status: true },
    }),
    prisma.promotion.findMany({
      where: { paymentMode: 'stripe', status: { in: ['ACTIVE', 'EXPIRED'] } },
      select: { promoterId: true, createdAt: true, amountCents: true, paymentMode: true, status: true, orderId: true, id: true },
    }),
    prisma.organiserSubscription.findMany({
      select: { userId: true, status: true, amountCents: true, cancelAtPeriodEnd: true },
    }),
    prisma.campaign.findMany({ where: { status: 'ACTIVE', paymentMode: 'stripe' }, select: { promoterId: true }, distinct: ['promoterId'] }),
    prisma.promotion.findMany({ where: { status: 'ACTIVE', paymentMode: 'stripe' }, select: { promoterId: true }, distinct: ['promoterId'] }),
    prisma.sponsorshipLead.count(),
  ])
  const paying = new Set<string>([
    ...activeBoosts.map((row) => row.promoterId),
    ...activePackages.map((row) => row.promoterId),
    ...subs.filter((row) => row.status === 'ACTIVE').map((row) => row.userId),
  ])
  const purchases: { organiserId: string; at: number }[] = []
  for (const row of campaigns) {
    if (row.status === 'REFUNDED' || row.createdAt < since) continue
    purchases.push({ organiserId: row.promoterId, at: row.createdAt.getTime() })
  }
  const orders = new Map<string, { organiserId: string; at: number }>()
  for (const row of promotions) {
    if (row.createdAt < since) continue
    const key = row.orderId || row.id
    const prev = orders.get(key)
    if (!prev || row.createdAt.getTime() < prev.at) orders.set(key, { organiserId: row.promoterId, at: row.createdAt.getTime() })
  }
  purchases.push(...orders.values())
  const repeat = repeatPurchase90d(purchases, now.getTime())
  const margin = placementMargin([...campaigns, ...promotions])
  const mrr = monthlyRecurringRevenue(subs)
  return {
    payingOrganisers: paying.size,
    repeatPurchase90d: repeat,
    mrr,
    margin,
    quoteRequests: leads,
  }
}
