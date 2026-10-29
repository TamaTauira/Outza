import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { sydneyToday } from '@/lib/event-store'
import { isPastEvent } from '@/lib/seo'
import { verifiedFlags } from '@/lib/listing-trust'

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
          venueName: true, suburb: true, city: true, category: true, subTags: true, isLGBTI: true, isFree: true, price: true, priceMin: true,
          ticketUrl: true, organiserUrl: true, source: true, status: true, statusSource: true, lastVerifiedAt: true, duplicateOfId: true,
        },
      },
    },
  })
  const upcoming = rows.filter((r) => !isPastEvent(r.event)).map((r) => r.event)
  const flags = await verifiedFlags(upcoming)
  return NextResponse.json({
    events: upcoming.map((event) => ({
      ...event,
      description: event.description?.slice(0, 400) ?? null,
      lastVerifiedAt: event.lastVerifiedAt?.toISOString() ?? null,
      verified: flags.get(event.id) ?? false,
    })),
  })
}

export async function GET() {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  return list(me.id)
}

/** body: { eventId, saved } toggles one; body: { ids: [] } merges a local list */
export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const b = await req.json().catch(() => ({}))
  if (Array.isArray(b.ids)) {
    // Removals made on a device before it was linked to the account
    const removed: string[] = Array.isArray(b.removed) ? b.removed.filter((x: unknown) => typeof x === 'string').slice(0, 500) : []
    if (removed.length) await prisma.savedEvent.deleteMany({ where: { userId: me.id, eventId: { in: removed } } })
    const gone = new Set(removed)
    const ids: string[] = b.ids.filter((x: unknown) => typeof x === 'string' && !gone.has(x)).slice(0, 500)
    const existing = ids.length ? await prisma.event.findMany({ where: { id: { in: ids } }, select: { id: true } }) : []
    if (existing.length) {
      await prisma.savedEvent.createMany({ data: existing.map((e) => ({ userId: me.id, eventId: e.id })), skipDuplicates: true })
    }
  } else if (typeof b.eventId === 'string') {
    if (b.saved) {
      const ev = await prisma.event.findUnique({ where: { id: b.eventId }, select: { id: true } })
      if (ev) await prisma.savedEvent.createMany({ data: [{ userId: me.id, eventId: ev.id }], skipDuplicates: true })
    } else {
      await prisma.savedEvent.deleteMany({ where: { userId: me.id, eventId: b.eventId } })
    }
    return NextResponse.json({ ok: true })
  }
  return list(me.id)
}
