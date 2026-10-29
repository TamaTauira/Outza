import { prisma } from '@/lib/prisma'
import { sydneyToday } from '@/lib/event-store'
import { activeTierMap } from '@/lib/promotions'
import { friendsGoing } from '@/lib/social'
import { getSessionUser } from '@/lib/session'
import { imageAssetSelect } from '@/lib/images/spec'
import { isPastEvent } from '@/lib/seo'
import { activityTitle, availabilityLine, confidence, outzaVerified, priceSummary, scheduleCue, similarity, normalizeTitle, normalizeVenue, statusInfo, sourceLabel, RECURRENCE_LABEL, VERIFIED_BLOCKING_REPORTS, type Recurrence } from '@/lib/quality'

/**
 * Full event detail payload shared by the event page (server-rendered) and GET /api/events/[id].
 * Returns null when the event doesn't exist.
 */
export async function getEventDetail(id: string, opts: { countView?: boolean; prefetch?: boolean } = {}) {
  const event = await prisma.event.findUnique({
    where: { id },
    include: { promoter: { select: { id: true, name: true, orgName: true, proUntil: true } }, _count: { select: { attendees: true } }, imageAsset: { select: imageAssetSelect } },
  })
  // Past events are never shown (the page and API answer "not found")
  if (!event || isPastEvent(event)) return null

  const meEarly = opts.countView ? await getSessionUser().catch(() => null) : null
  // One count per real visit. Prefetch and the promoter opening their own page are not audience.
  const ownerView = !!meEarly && meEarly.id === event.promoterId
  if (opts.countView && !opts.prefetch && !ownerView) {
    prisma.event.update({ where: { id: event.id }, data: { views: { increment: 1 } }, select: { id: true } }).catch((e) => console.error('view count failed', e?.message))
  }

  const relatedRows = await prisma.event.findMany({
    where: {
      id: { not: event.id },
      city: event.city,
      date: { gte: sydneyToday() },
      duplicateOfId: null,
      OR: [{ category: event.category }, { venueName: event.venueName }],
      ...(event.seriesKey ? { NOT: { seriesKey: event.seriesKey } } : {}),
    },
    take: 24,
    orderBy: { date: 'asc' },
    include: { imageAsset: { select: imageAssetSelect } },
  })
  const ownActivity = activityTitle(event.title)
  const related = relatedRows.filter((r) => {
    const ts = similarity(normalizeTitle(event.title), normalizeTitle(r.title))
    const vs = similarity(normalizeVenue(event.venueName), normalizeVenue(r.venueName))
    if (ts >= 0.8 && vs >= 0.34) return false
    if (vs >= 0.8 && ts >= 0.55) return false
    const other = activityTitle(r.title)
    if (ownActivity && other && ownActivity === other && vs >= 0.34) return false
    return true
  }).slice(0, 6)

  const me = meEarly ?? await getSessionUser().catch(() => null)
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
  const openReports = await prisma.eventReport.findMany({
    where: { eventId: event.id, status: 'OPEN', reason: { in: [...VERIFIED_BLOCKING_REPORTS] } },
    select: { reason: true },
  })
  const quality = {
    confidence: confidence({ ...event, promoterVerified }),
    status: statusInfo(event.status, event.statusSource),
    price: priceSummary(event),
    recurrence: event.recurrence ? RECURRENCE_LABEL[event.recurrence as Recurrence] ?? null : null,
    sources: [...new Set([event.source, ...(event.sources ?? [])])].map(sourceLabel),
    checkedAt: (event.lastVerifiedAt ?? event.updatedAt).toISOString(),
    verified: outzaVerified({ ...event, openReportReasons: openReports.map((r) => r.reason) }),
    schedule: scheduleCue(event),
    availability: availabilityLine(event.status, event.statusSource),
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
