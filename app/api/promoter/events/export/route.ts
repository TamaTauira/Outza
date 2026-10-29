import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized, forbidden, isPromoter } from '@/lib/session'

export const dynamic = 'force-dynamic'

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** The signed-in promoter's listings as CSV. */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const events = await prisma.event.findMany({
    where: { promoterId: me.id },
    orderBy: { date: 'asc' },
    select: { title: true, date: true, endDate: true, time: true, endTime: true, city: true, suburb: true, venueName: true, category: true, subTags: true, isLGBTI: true, isFree: true, price: true, status: true, views: true, ticketClicks: true, ticketUrl: true },
  })
  const header = ['title', 'date', 'endDate', 'time', 'endTime', 'city', 'suburb', 'venue', 'category', 'subTags', 'lgbtiq', 'free', 'price', 'status', 'views', 'ticketClicks', 'ticketUrl']
  const lines = events.map((e) => [
    e.title, e.date.toISOString().slice(0, 10), e.endDate?.toISOString().slice(0, 10) ?? '', e.time ?? '', e.endTime ?? '',
    e.city, e.suburb ?? '', e.venueName, e.category, e.subTags.join('|'), e.isLGBTI ? 'yes' : 'no', e.isFree ? 'yes' : 'no',
    e.price ?? '', e.status, e.views, e.ticketClicks, e.ticketUrl ?? '',
  ].map(cell).join(','))
  const csv = [header.join(','), ...lines].join('\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="vibepeep-events.csv"',
    },
  })
}
