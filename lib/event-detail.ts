import { prisma } from '@/lib/prisma'
import { sydneyToday } from '@/lib/event-store'
import { activeTierMap } from '@/lib/promotions'
import { friendsGoing } from '@/lib/social'
import { getSessionUser } from '@/lib/session'
import { imageAssetSelect } from '@/lib/images/spec'
import { isPastEvent } from '@/lib/seo'
import { confidence, priceSummary, statusInfo, sourceLabel, RECURRENCE_LABEL, type Recurrence } from '@/lib/quality'

/**
 * Full event detail payload shared by the event page (server-rendered) and GET /api/events/[id].
 * Returns null when the event doesn't exist.
 */
export async function getEventDetail(id: string, opts: { countView?: boolean } = {}) {
  const event = await prisma.event.findUnique({
    where: { id },
    include: { promoter: { select: { id: true, name: true, orgName: true, proUntil: true } }, _count: { select: { attendees: true } }, imageAsset: { select: imageAssetSelect } },
  })
  // Past events are never shown (the page and API answer "not found")
  if (!event || isPastEvent(event)) return null

  // Count a listing view (used in promoter analytics); never block the response on it
  if (opts.countView !== false) {
    prisma.event.update({ where: { id: event.id }, data: { views: { increment: 1 } }, select: { id: true } }).catch((e) => console.error('view count failed', e?.message))
  }

  const related = await prisma.event.findMany({
    where: {
      id: { not: event.id },
      city: event.city,
      date: { gte: sydneyToday() },
      duplicateOfId: null,
      OR: [{ category: event.category }, { venueName: event.venueName }],
    },
    take: 6,
    orderBy: { date: 'asc' },
    include: { imageAsset: { select: imageAssetSelect } },
  })

  const me = await getSessionUser().catch(() => null)
  const [tiers, friends, mine, following] = await Promise.all([
    activeTierMap([event.id]),
    me ? friendsGoing(me.id, [event.id]) : Promise.resolve({} as Record<string, string[]>),
    me ? prisma.attendance.findUnique({ where: { userId_eventId: { userId: me.id, eventId: event.id } } }) : Promise.resolve(null),
    me && event.promoterId
      ? prisma.promoterFollow.findUnique({ where: { followerId_promoterId: { followerId: me.id, promoterId: event.promoterId } } })
      : Promise.resolve(null),
  ])

  const { _count, promoter, views: _v, ticketClicks: _c, ...rest } = event
  const promoterVerified = !!promoter?.proUntil && promoter.proUntil > new Date()
  const quality = {
    confidence: confidence({ ...event, promoterVerified }),
    status: statusInfo(event.status, event.statusSource),
    price: priceSummary(event),
    recurrence: event.recurrence ? RECURRENCE_LABEL[event.recurrence as Recurrence] ?? null : null,
    sources: [...new Set([event.source, ...(event.sources ?? [])])].map(sourceLabel),
    checkedAt: (event.lastVerifiedAt ?? event.updatedAt).toISOString(),
  }
  return {
    event: {
      ...rest,
      promoter: promoter ? { id: promoter.id, name: promoter.name, orgName: promoter.orgName, verified: promoterVerified } : null,
      attendeeCount: _count.attendees,
      promoTier: tiers[event.id] ?? null,
      friendsGoing: friends[event.id] ?? [],
      going: !!mine,
      followingPromoter: !!following,
      isMine: !!me && !!event.promoterId && event.promoterId === me.id,
      quality,
    },
    related,
    signedIn: !!me,
  }
}

export type EventDetailPayload = NonNullable<Awaited<ReturnType<typeof getEventDetail>>>
