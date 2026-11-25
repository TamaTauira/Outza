import { prisma } from '@/lib/db'

/** Copy after a promoter or admin ends a live campaign. Test mode never implies a refund. */
export function endCampaignMessage(modes: string[]): string {
  const testOnly = modes.length > 0 && modes.every((mode) => mode === 'test')
  if (testOnly) return 'Campaign ended. Test mode: no card was charged, so nothing is refunded. It leaves the board now.'
  return 'Campaign ended. It leaves the board now. A refund is not sent from here. The refunds page still applies.'
}

export function endCampaignConfirm(name: string, test: boolean): string {
  if (test) return `End ${name} now? It leaves the board immediately. Test mode: no card was charged, so nothing is refunded.`
  return `End ${name} now? It leaves the board immediately. A refund is not sent from here.`
}

/** Ends live promotions for one event, or one promotion id. Does not call Stripe. */
export async function endActivePromotions(where: { promoterId?: string; eventId?: string; id?: string }) {
  const now = new Date()
  const rows = await prisma.promotion.findMany({
    where: {
      status: 'ACTIVE',
      endsAt: { gt: now },
      ...(where.promoterId ? { promoterId: where.promoterId } : {}),
      ...(where.eventId ? { eventId: where.eventId } : {}),
      ...(where.id ? { id: where.id } : {}),
    },
    select: { id: true, paymentMode: true, tier: true, eventId: true, event: { select: { title: true } } },
  })
  if (!rows.length) return { count: 0, modes: [] as string[], title: '' }
  await prisma.promotion.updateMany({
    where: { id: { in: rows.map((row) => row.id) } },
    data: { status: 'CANCELLED', endsAt: now },
  })
  return { count: rows.length, modes: rows.map((row) => row.paymentMode), title: rows[0]?.event.title ?? '' }
}
