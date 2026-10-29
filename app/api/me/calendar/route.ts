import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { eventsToIcs } from '@/lib/ics'
import { isPastEvent, eventPath } from '@/lib/seo'
import { siteUrl } from '@/lib/site-url'

export const dynamic = 'force-dynamic'

export async function GET() {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const rows = await prisma.savedEvent.findMany({
    where: { userId: me.id },
    orderBy: { event: { date: 'asc' } },
    take: 80,
    select: {
      event: {
        select: { id: true, title: true, date: true, endDate: true, time: true, endTime: true, venueName: true, city: true },
      },
    },
  })
  const events = rows.map((row) => row.event).filter((ev) => !isPastEvent(ev)).map((ev) => ({
    ...ev,
    url: `${siteUrl()}${eventPath(ev)}`,
  }))
  const body = eventsToIcs(events, { calendarName: 'My Outza' })
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="my-outza.ics"',
    },
  })
}
