import { prisma } from '@/lib/db'

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
    select: { id: true, paymentMode: true },
  })
  if (!rows.length) return { count: 0, modes: [] as string[] }
  await prisma.promotion.updateMany({
    where: { id: { in: rows.map((row) => row.id) } },
    data: { status: 'CANCELLED', endsAt: now },
  })
  return { count: rows.length, modes: rows.map((row) => row.paymentMode) }
}
