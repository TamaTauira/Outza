import { prisma } from '@/lib/db'
import { tierDef } from '@/lib/tiers'
import { canManageVenue } from '@/lib/venue-access'
import { venueRoleAllows } from '@/lib/ownership'

/** Spotlight and other packages this venue's own team paid for. Not another organiser's spend. */
export async function venueSpotlightResults(userId: string, venueId: string) {
  const access = await canManageVenue(userId, venueId)
  if (!access.allowed || !venueRoleAllows(access.role, 'viewEvents') || !access.organisationId) {
    return { status: 403 as const, error: 'You don’t manage this venue.' }
  }
  const members = await prisma.organisationMembership.findMany({
    where: { organisationId: access.organisationId, status: 'ACTIVE', revokedAt: null },
    select: { userId: true },
  })
  const buyerIds = members.map((row) => row.userId)
  if (!buyerIds.length) return { status: 200 as const, results: [] }
  const rows = await prisma.promotion.findMany({
    where: {
      promoterId: { in: buyerIds },
      status: { in: ['PENDING', 'ACTIVE', 'EXPIRED'] },
      event: { venueId },
    },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: {
      id: true, eventId: true, tier: true, status: true, startsAt: true, endsAt: true, amountCents: true,
      event: { select: { title: true } },
    },
  })
  const eventIds = [...new Set(rows.map((row) => row.eventId))]
  const points = eventIds.length
    ? await prisma.engagementDay.findMany({
      where: { eventId: { in: eventIds }, kind: { in: ['VIEW', 'TICKET'] } },
      select: { eventId: true, day: true, kind: true, count: true },
    })
    : []
  const results = rows.map((row) => {
    const start = row.startsAt ? row.startsAt.toISOString().slice(0, 10) : null
    const end = row.endsAt ? row.endsAt.toISOString().slice(0, 10) : null
    const sum = (kind: string) => points
      .filter((point) => point.eventId === row.eventId && point.kind === kind && start && end && point.day >= start && point.day <= end)
      .reduce((total, point) => total + point.count, 0)
    return {
      id: row.id,
      eventId: row.eventId,
      title: row.event.title,
      name: tierDef(row.tier)?.name ?? row.tier,
      status: row.status,
      amountCents: row.amountCents,
      startsAt: row.startsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      views: start && end ? sum('VIEW') : null,
      ticketClicks: start && end ? sum('TICKET') : null,
    }
  })
  return { status: 200 as const, results }
}
