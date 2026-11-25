import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { recordLandingFromCookieJar } from '@/lib/landing-stats'
import { getSessionUser, unauthorized } from '@/lib/session'
import { sydneyToday } from '@/lib/event-store'
import { isPastEvent } from '@/lib/seo'
import { isHiddenFromPublic, omitCommunitySecrets, redactCommunityPublic } from '@/lib/community-shared'
import { occurrences, parseLocalSaveId } from '@/lib/local-shared'
export const dynamic = 'force-dynamic'

/** DB pre-filter one day wide (cities west of Sydney can still be on yesterday); the exact per-city check is isPastEvent. */
const yesterday = () => new Date(sydneyToday().getTime() - 86400000)

async function list(userId: string) {
  const rows = await prisma.savedEvent.findMany({
    // Past events stay saved in the account but are never shown
    where: { userId, event: { OR: [{ date: { gte: yesterday() } }, { endDate: { gte: yesterday() } }] } },
    orderBy: { createdAt: 'asc' },
    select: {
      event: {
        select: {
          id: true, title: true, description: true, date: true, endDate: true, time: true, endTime: true,
          venueName: true, venueAddress: true, suburb: true, city: true, category: true, subTags: true, isLGBTI: true, isFree: true, price: true, priceMin: true, priceMax: true,
          imageUrl: true, latitude: true, longitude: true,
          ticketUrl: true, organiserUrl: true, source: true, status: true, statusSource: true, lastVerifiedAt: true, duplicateOfId: true,
          communityKey: true, locationVisibility: true, childrenInImage: true, imageKidSafe: true, communityFlags: true,
          hidden: true, moderationStatus: true,
        },
      },
    },
  })
  const upcoming = rows.filter((r) => r.event && !isPastEvent(r.event) && !isHiddenFromPublic(r.event)).map((r) => r.event)
  return NextResponse.json({
    events: upcoming.map((event) => {
      const opened = omitCommunitySecrets(redactCommunityPublic({
        ...event,
        description: event.description?.slice(0, 400) ?? null,
        lastVerifiedAt: event.lastVerifiedAt?.toISOString() ?? null,
      }))
      return opened
    }),
  })
}

export async function GET() {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  return list(me.id)
}

/**
 * A Little local finds row is a Local listing, not a board event.
 * Confirm the dated listing, then let the signed-in device keep it.
 * SavedEvent can only point at an Event, and this does not write one.
 */
async function savedLocalListing(eventId: string) {
  const parsed = parseLocalSaveId(eventId)
  if (!parsed) return null
  const row = await prisma.localListing.findUnique({
    where: { id: parsed.listingId },
    select: { id: true, status: true, duplicateOfId: true, expiresAt: true, startDate: true, endDate: true, recurrence: true, recurUntil: true },
  })
  if (!row || row.status !== 'APPROVED' || row.duplicateOfId || row.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }
  if (!occurrences(row, parsed.date, parsed.date).includes(parsed.date)) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

/** body: { eventId, saved } toggles one. A bulk { ids } list is not imported — that copied one account's device cache onto the next person. */
export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const b = await req.json().catch(() => ({}))
  if (Array.isArray(b.ids)) {
    return NextResponse.json({ error: 'Save one event at a time.' }, { status: 400 })
  }
  if (typeof b.eventId === 'string') {
    if (b.saved) {
      const local = await savedLocalListing(b.eventId)
      if (local) return local
      const ev = await prisma.event.findUnique({ where: { id: b.eventId }, select: { id: true } })
      if (!ev) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
      const already = await prisma.savedEvent.findUnique({ where: { userId_eventId: { userId: me.id, eventId: ev.id } }, select: { eventId: true } })
      if (!already) {
        await prisma.savedEvent.createMany({ data: [{ userId: me.id, eventId: ev.id }], skipDuplicates: true })
        const jar = await cookies()
        await recordLandingFromCookieJar((name) => jar.get(name)?.value, 'save')
        const { bumpEngagement } = await import('@/lib/engagement-store')
        await bumpEngagement(ev.id, 'SAVE')
        const { METRIC, recordProductMetrics } = await import('@/lib/product-metrics')
        const { metricSurface } = await import('@/lib/organiser-reach')
        await recordProductMetrics([{ name: METRIC.save, subjectId: ev.id, subjectKind: 'event', dim: metricSurface(b.surface) }])
      }
    } else {
      await prisma.savedEvent.deleteMany({ where: { userId: me.id, eventId: b.eventId } })
    }
    return NextResponse.json({ ok: true })
  }
  return list(me.id)
}
