import { prisma } from '@/lib/db'
import { actionWindows, missingRelation } from '@/lib/engagement-store'
import { canManageEvent } from '@/lib/event-overrides'
import { performanceView, type CampaignSnapshot } from '@/lib/organiser-analytics'
import { canSeeOrganiserAnalytics } from '@/lib/ownership'

export async function eventPerformance(userId: string, eventId: string, isAdmin: boolean) {
  const loaded = await canManageEvent(userId, eventId, isAdmin)
  if (!loaded.event) return { status: 404 as const, error: 'Event not found' }
  if (!canSeeOrganiserAnalytics(loaded.access.allowed)) return { status: 403 as const, error: 'You don’t manage this event.' }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      promoterId: true,
      views: true,
      ticketClicks: true,
      _count: { select: { savedBy: true, attendees: true } },
    },
  })
  if (!event) return { status: 404 as const, error: 'Event not found' }

  let reactions = 0
  try {
    reactions = await prisma.eventReaction.count({ where: { eventId, kind: { not: 'GOING' } } })
  } catch (err) {
    if (!missingRelation(err)) console.error('reaction total failed', (err as Error)?.message)
  }
  let uniqueViews = 0
  try {
    uniqueViews = await prisma.eventSignal.count({ where: { eventId, kind: 'VIEW' } })
  } catch (err) {
    if (!missingRelation(err)) console.error('unique views failed', (err as Error)?.message)
  }

  const windows = await actionWindows([eventId])
  const [user, placements] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { proUntil: true } }),
    prisma.promotion.count({ where: { eventId, promoterId: userId, status: { in: ['ACTIVE', 'EXPIRED'] } } }),
  ])
  const unlocked = isAdmin || placements > 0 || (!!user?.proUntil && user.proUntil > new Date())

  let campaigns: CampaignSnapshot[] | null = null
  if (isAdmin || event.promoterId === userId) {
    const rows = await prisma.campaign.findMany({
      where: { eventId, ...(isAdmin ? {} : { promoterId: userId }) },
      select: { id: true, status: true, startsAt: true, endsAt: true },
    })
    campaigns = []
    for (const row of rows) {
      const [impressions, clicks] = await Promise.all([
        prisma.impression.aggregate({ where: { campaignId: row.id }, _sum: { count: true } }),
        prisma.conversionEvent.count({ where: { campaignId: row.id, kind: { in: ['DETAIL', 'TICKET'] } } }),
      ])
      campaigns.push({
        status: row.status,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        impressions: impressions._sum.count ?? 0,
        clicks,
      })
    }
  }

  return {
    status: 200 as const,
    performance: performanceView({
      views: event.views,
      uniqueViews,
      ticketClicks: event.ticketClicks,
      saves: event._count.savedBy,
      going: event._count.attendees,
      reactions,
      recentActions: windows.recent,
      previousActions: windows.previous,
      campaigns,
      unlocked,
    }),
  }
}
