import { prisma } from '@/lib/db'
import { sydneyToday } from '@/lib/event-store'
import { nearbyDemand, shapeVenueActivity, type NearbyEvent } from '@/lib/venue-activity'

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Indexed totals for one venue. A timeout returns null rather than a made-up zero. */
export async function loadVenueActivity(venueId: string, start: Date, startKey: string, endKey: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '4s'`
      const totals = await tx.$queryRaw<{ kind: string; total: number }[]>`
        SELECT ed.kind, COALESCE(SUM(ed.count), 0)::int AS total
        FROM "EngagementDay" ed
        INNER JOIN "Event" e ON e.id = ed."eventId"
        WHERE e."venueId" = ${venueId}
          AND e."duplicateOfId" IS NULL
          AND ed.day >= ${startKey} AND ed.day <= ${endKey}
          AND ed.kind IN ('VIEW', 'SAVE', 'TICKET')
        GROUP BY ed.kind
      `
      const itinerary = await tx.$queryRaw<{ total: number }[]>`
        SELECT COALESCE(SUM(pm.count), 0)::int AS total
        FROM "ProductMetric" pm
        INNER JOIN "Event" e ON e.id = pm."subjectId"
        WHERE e."venueId" = ${venueId}
          AND e."duplicateOfId" IS NULL
          AND pm."subjectKind" = 'event'
          AND pm.name = 'itinerary'
          AND pm.day >= ${startKey} AND pm.day <= ${endKey}
      `
      const nights = await tx.$queryRaw<{ dow: number; views: number }[]>`
        SELECT EXTRACT(DOW FROM ed.day::date)::int AS dow, COALESCE(SUM(ed.count), 0)::int AS views
        FROM "EngagementDay" ed
        INNER JOIN "Event" e ON e.id = ed."eventId"
        WHERE e."venueId" = ${venueId}
          AND e."duplicateOfId" IS NULL
          AND ed.kind = 'VIEW'
          AND ed.day >= ${startKey} AND ed.day <= ${endKey}
        GROUP BY 1
      `
      const categories = await tx.$queryRaw<{ category: string; views: number }[]>`
        SELECT e.category, COALESCE(SUM(ed.count), 0)::int AS views
        FROM "EngagementDay" ed
        INNER JOIN "Event" e ON e.id = ed."eventId"
        WHERE e."venueId" = ${venueId}
          AND e."duplicateOfId" IS NULL
          AND ed.kind = 'VIEW'
          AND ed.day >= ${startKey} AND ed.day <= ${endKey}
        GROUP BY e.category
        ORDER BY views DESC
        LIMIT 8
      `
      const people = await tx.$queryRaw<{ postcode: string | null; birth_year: number | null; people: number }[]>`
        SELECT u."homePostcode" AS postcode, u."birthYear" AS birth_year, COUNT(DISTINCT u.id)::int AS people
        FROM (
          SELECT s."userId" AS uid
          FROM "SavedEvent" s
          INNER JOIN "Event" e ON e.id = s."eventId"
          WHERE e."venueId" = ${venueId} AND s."createdAt" >= ${start}
          UNION
          SELECT g."userId"
          FROM "EventSignal" g
          INNER JOIN "Event" e ON e.id = g."eventId"
          WHERE e."venueId" = ${venueId}
            AND g.kind IN ('ITINERARY', 'TICKET')
            AND g."createdAt" >= ${start}
        ) engaged
        INNER JOIN "User" u ON u.id = engaged.uid
        WHERE u."homePostcode" IS NOT NULL
          AND u.email NOT LIKE 'outza-tester+qa-%@mail.grokbot.com'
        GROUP BY u."homePostcode", u."birthYear"
      `
      const byKind = new Map(totals.map((row) => [row.kind, num(row.total)]))
      return shapeVenueActivity({
        views: byKind.get('VIEW') ?? 0,
        saves: byKind.get('SAVE') ?? 0,
        ticketClicks: byKind.get('TICKET') ?? 0,
        itineraryAdds: num(itinerary[0]?.total),
        nights: nights.map((row) => ({ dow: num(row.dow), views: num(row.views) })),
        categories: categories.map((row) => ({ category: row.category, views: num(row.views) })),
        people: people.map((row) => ({ postcode: row.postcode, birthYear: row.birth_year, people: num(row.people) })),
      })
    }, { timeout: 8000, maxWait: 2000 })
  } catch (err) {
    console.error('venue activity failed', (err as Error)?.message)
    return null
  }
}

export async function loadNearbyDemand(venueId: string) {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { city: true, latitude: true, longitude: true },
  })
  if (!venue) return null
  const today = sydneyToday()
  const mine = await prisma.event.findMany({
    where: { venueId, duplicateOfId: null, deletedAt: null, date: { gte: today }, status: { not: 'CANCELLED' } },
    select: { date: true },
    orderBy: { date: 'asc' },
    take: 40,
  })
  const dates = [...new Set(mine.map((row) => row.date.toISOString().slice(0, 10)))].slice(0, 8)
  if (!dates.length) return { basis: 'No upcoming nights at this venue', nights: [] as { date: string; events: NearbyEvent[]; gap: boolean }[] }
  const dateValues = dates.map((day) => new Date(`${day}T00:00:00.000Z`))
  const hasPin = venue.latitude != null && venue.longitude != null
  const span = 0.04
  const rows = await prisma.event.findMany({
    where: {
      city: venue.city,
      date: { in: dateValues },
      duplicateOfId: null,
      deletedAt: null,
      status: { not: 'CANCELLED' },
      NOT: { venueId },
      ...(hasPin ? {
        latitude: { gte: (venue.latitude as number) - span, lte: (venue.latitude as number) + span },
        longitude: { gte: (venue.longitude as number) - span, lte: (venue.longitude as number) + span },
      } : {}),
    },
    select: { id: true, title: true, date: true, time: true, venueName: true, category: true, latitude: true, longitude: true },
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
    take: 60,
  })
  const others: NearbyEvent[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    date: row.date.toISOString(),
    time: row.time,
    venueName: row.venueName,
    category: row.category,
    lat: row.latitude,
    lng: row.longitude,
  }))
  return nearbyDemand({ lat: venue.latitude, lng: venue.longitude, dates, others })
}
