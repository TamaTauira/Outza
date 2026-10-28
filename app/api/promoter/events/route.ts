import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized, forbidden, isPromoter } from '@/lib/session'
import { CATEGORIES } from '@/lib/categories'
import { CITY_NAMES, cityDef, suburbFromAddress } from '@/lib/cities'
import { makeSeriesKey } from '@/lib/event-store'
import { parsePriceRange } from '@/lib/quality'
import { bestSourceUrl } from '@/lib/images/source-url'
import { queueEventImage } from '@/lib/images/runner'

export const dynamic = 'force-dynamic'

/** The promoter's events with promotions, stats, Pro status and billing history */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const [events, user, passes] = await Promise.all([
    prisma.event.findMany({
      where: { promoterId: me.id },
      orderBy: { date: 'asc' },
      select: {
        id: true, title: true, date: true, time: true, venueName: true, city: true, price: true, isFree: true, category: true,
        views: true, ticketClicks: true,
        endTime: true, venueAddress: true, ticketUrl: true, imageUrl: true, description: true, organiserName: true, organiserUrl: true,
        accessibilityInfo: true, ageRestriction: true, transportInfo: true, organiserEditedAt: true,
        referrals: { select: { source: true, count: true } },
        promotions: { orderBy: { createdAt: 'desc' }, select: { id: true, tier: true, days: true, orderId: true, status: true, amountCents: true, paymentMode: true, startsAt: true, endsAt: true, createdAt: true } },
        _count: { select: { savedBy: true, attendees: true } },
      },
    }),
    prisma.user.findUnique({ where: { id: me.id }, select: { proUntil: true, orgName: true, name: true, weeklyReport: true, lastReportAt: true } }),
    prisma.proPass.findMany({ where: { userId: me.id, status: { not: 'PENDING' } }, orderBy: { createdAt: 'desc' }, take: 24, select: { id: true, status: true, amountCents: true, paymentMode: true, endsAt: true, createdAt: true } }),
  ])
  return NextResponse.json({
    events,
    account: { proUntil: user?.proUntil ?? null, pro: !!user?.proUntil && user.proUntil > new Date(), displayName: user?.orgName || user?.name || '', weeklyReport: !!user?.weeklyReport, lastReportAt: user?.lastReportAt ?? null },
    passes,
  })
}

/** Create a new event owned by the promoter */
export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const b = await req.json().catch(() => ({}))
  const title = String(b.title ?? '').trim().slice(0, 250)
  const date = String(b.date ?? '')
  const venueName = String(b.venueName ?? '').trim().slice(0, 200)
  const city = CITY_NAMES.includes(b.city) ? b.city : 'Sydney'
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !venueName) {
    return NextResponse.json({ error: 'Title, date and venue are required' }, { status: 400 })
  }
  const time = /^\d{2}:\d{2}$/.test(b.time ?? '') ? b.time : null
  const category = CATEGORIES.some((c) => c.name === b.category) ? b.category : 'Community'
  const venueAddress = String(b.venueAddress ?? '').trim().slice(0, 300) || null
  const price = String(b.price ?? '').trim().slice(0, 60) || null
  const isFree = !!b.isFree || /^free$/i.test(price ?? '')
  const ticketUrl = /^https?:\/\//.test(b.ticketUrl ?? '') ? String(b.ticketUrl).slice(0, 500) : null
  const def = cityDef(city)
  const txt = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max) || null
  const endTime = /^\d{2}:\d{2}$/.test(b.endTime ?? '') ? b.endTime : null
  const galleryUrls = String(b.galleryUrls ?? '').split(/[\s,]+/).filter((u) => /^https?:\/\//.test(u)).slice(0, 8).map((u) => u.slice(0, 500))
  const organiserUrl = /^https?:\/\//.test(b.organiserUrl ?? '') ? String(b.organiserUrl).slice(0, 500) : null
  const range = parsePriceRange(isFree, price)
  const event = await prisma.event.create({
    data: {
      title, date: new Date(`${date}T00:00:00.000Z`), time, endTime, venueName,
      galleryUrls, organiserUrl, organiserName: txt(b.organiserName, 160),
      accessibilityInfo: txt(b.accessibilityInfo, 1000), ageRestriction: txt(b.ageRestriction, 120), transportInfo: txt(b.transportInfo, 1000), venueAddress, city, category,
      description: String(b.description ?? '').trim().slice(0, 2000) || null,
      price: isFree ? 'Free' : price, isFree, ticketUrl,
      imageUrl: /^https?:\/\//.test(b.imageUrl ?? '') ? bestSourceUrl(String(b.imageUrl).slice(0, 500)) : null,
      suburb: suburbFromAddress(venueAddress) ?? city,
      latitude: def?.lat ?? null, longitude: def?.lng ?? null,
      source: 'promoter', sources: ['promoter'], promoterId: me.id, lastVerifiedAt: new Date(),
      priceMin: range.min, priceMax: range.max, seriesKey: makeSeriesKey(title, venueName, city),
      dedupeHash: `promoter-${crypto.randomUUID()}`,
    },
    select: { id: true, imageUrl: true },
  })
  // Organiser artwork goes through the same import/quality pipeline, in the background
  if (event.imageUrl) queueEventImage(event.id)
  return NextResponse.json({ ok: true, id: event.id })
}
