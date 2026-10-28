import { prisma } from '@/lib/db'
import { TIER_KEYS, TIER_RANK, tierDef, type Tier } from '@/lib/tiers'

export function activePromoWhere(now = new Date()) {
  return { status: 'ACTIVE', endsAt: { gt: now } }
}

/** eventId -> highest active tier (add-ons are ignored) */
export async function activeTierMap(eventIds: string[]): Promise<Record<string, Tier>> {
  const out: Record<string, Tier> = {}
  if (!eventIds.length) return out
  const rows = await prisma.promotion.findMany({
    where: { eventId: { in: eventIds }, tier: { in: TIER_KEYS }, ...activePromoWhere() },
    select: { eventId: true, tier: true },
  })
  for (const r of rows) {
    const t = r.tier as Tier
    if (!out[r.eventId] || TIER_RANK[t] > TIER_RANK[out[r.eventId]]) out[r.eventId] = t
  }
  return out
}

/** Marks a promotion as paid/active for its campaign length. Idempotent. */
export async function activatePromotion(promotionId: string, days?: number) {
  const promo = await prisma.promotion.findUnique({ where: { id: promotionId } })
  if (!promo) return { promo: null, changed: false }
  if (promo.status === 'ACTIVE') return { promo, changed: false }
  const len = days ?? promo.days ?? tierDef(promo.tier)?.days ?? 30
  // Extend from the latest active promotion of the same event & product so renewals stack
  const prior = await prisma.promotion.findFirst({
    where: { eventId: promo.eventId, tier: promo.tier, id: { not: promo.id }, ...activePromoWhere() },
    orderBy: { endsAt: 'desc' },
  })
  const startsAt = prior?.endsAt && prior.endsAt > new Date() ? prior.endsAt : new Date()
  const endsAt = new Date(startsAt.getTime() + len * 86400000)
  const updated = await prisma.promotion.update({
    where: { id: promo.id },
    data: { status: 'ACTIVE', startsAt: new Date(), endsAt },
  })
  return { promo: updated, changed: true }
}

/** Activates every line of a checkout order. Returns ids that changed state. */
export async function activateOrder(orderId: string) {
  const rows = await prisma.promotion.findMany({ where: { orderId }, select: { id: true } })
  const changed: string[] = []
  for (const r of rows) {
    const res = await activatePromotion(r.id)
    if (res.changed) changed.push(r.id)
  }
  return changed
}

export const isProActive = (proUntil?: Date | string | null) => !!proUntil && new Date(proUntil) > new Date()

/** Activates a Pro pass, stacking on any remaining Pro time. Idempotent. */
export async function activateProPass(passId: string) {
  const pass = await prisma.proPass.findUnique({ where: { id: passId }, include: { user: { select: { proUntil: true } } } })
  if (!pass || pass.status === 'ACTIVE') return false
  const from = isProActive(pass.user.proUntil) ? new Date(pass.user.proUntil!) : new Date()
  const endsAt = new Date(from.getTime() + 30 * 86400000)
  await prisma.$transaction([
    prisma.proPass.update({ where: { id: pass.id }, data: { status: 'ACTIVE', startsAt: new Date(), endsAt } }),
    prisma.user.update({ where: { id: pass.userId }, data: { proUntil: endsAt } }),
  ])
  return true
}
