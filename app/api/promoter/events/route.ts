import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized, forbidden, isPromoter } from '@/lib/session'
import { makeSeriesKey } from '@/lib/event-store'
import { isSameEvent } from '@/lib/quality'
import { queueEventImage } from '@/lib/images/runner'
import { parsePromoterListing } from '@/lib/promoter-listing'
import { resolveListingPlace } from '@/lib/venue-place'

export const dynamic = 'force-dynamic'

const eventSelect = {
  id: true, title: true, date: true, endDate: true, time: true, endTime: true, venueName: true, venueAddress: true,
  suburb: true, city: true, price: true, isFree: true, category: true, subTags: true, isLGBTI: true, source: true,
  views: true, ticketClicks: true, ticketUrl: true, imageUrl: true, description: true, organiserName: true, organiserUrl: true,
        accessibilityInfo: true, ageRestriction: true, transportInfo: true, capacity: true, organiserEditedAt: true, status: true,
  referrals: { select: { source: true, count: true } },
  promotions: { orderBy: { createdAt: 'desc' as const }, select: { id: true, tier: true, days: true, orderId: true, status: true, amountCents: true, paymentMode: true, startsAt: true, endsAt: true, createdAt: true } },
  _count: { select: { savedBy: true, attendees: true } },
}

/** The promoter's events, pending claims, Pro status and billing (campaigns, Pro and local ads). */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const [events, user, passes, ads, claims] = await Promise.all([
    prisma.event.findMany({
      where: { promoterId: me.id },
      orderBy: { date: 'asc' },
      select: eventSelect,
    }),
    prisma.user.findUnique({ where: { id: me.id }, select: { proUntil: true, orgName: true, name: true, homeCity: true, weeklyReport: true, lastReportAt: true, bio: true, website: true, image: true } }),
    prisma.proPass.findMany({ where: { userId: me.id, status: { not: 'PENDING' } }, orderBy: { createdAt: 'desc' }, take: 24, select: { id: true, status: true, amountCents: true, paymentMode: true, endsAt: true, createdAt: true } }),
    prisma.localAd.findMany({
      where: { promoterId: me.id, status: { not: 'PENDING' } },
      orderBy: { createdAt: 'desc' },
      take: 24,
      select: { id: true, status: true, amountCents: true, paymentMode: true, endsAt: true, createdAt: true, businessName: true, event: { select: { title: true } } },
    }),
    prisma.eventClaim.findMany({
      where: { userId: me.id, status: { in: ['PENDING', 'REJECTED'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, status: true, createdAt: true, reviewNote: true, event: { select: { id: true, title: true, date: true, city: true, venueName: true } } },
    }),
  ])
  return NextResponse.json({
    events,
    claims,
    ads,
    account: {
      proUntil: user?.proUntil ?? null,
      pro: !!user?.proUntil && user.proUntil > new Date(),
      displayName: user?.orgName || user?.name || '',
      homeCity: user?.homeCity ?? 'Sydney',
      weeklyReport: !!user?.weeklyReport,
      lastReportAt: user?.lastReportAt ?? null,
      bio: user?.bio ?? '',
      website: user?.website ?? '',
      image: user?.image ?? '',
    },
    passes,
  })
}

/** Create a new event owned by the promoter */
export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const b = await req.json().catch(() => ({}))
  const parsed = parsePromoterListing(b)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const listing = parsed.listing
  const day = new Date(`${listing.date}T00:00:00.000Z`)
  const sameDay = await prisma.event.findMany({
    where: { promoterId: me.id, city: listing.city, date: day, duplicateOfId: null, status: { not: 'CANCELLED' } },
    select: { id: true, title: true, venueName: true, time: true, source: true },
    take: 30,
  })
  const dup = sameDay.find((e) => isSameEvent({ title: listing.title, venueName: listing.venueName, time: listing.time, source: 'promoter' }, e))
  if (dup) return NextResponse.json({ error: `This looks like “${dup.title}”, already on your dashboard for that day. Edit that listing instead of creating another.`, existingId: dup.id }, { status: 409 })

  const place = await resolveListingPlace({ venueAddress: listing.venueAddress, venueName: listing.venueName, city: listing.city })
  const event = await prisma.event.create({
    data: {
      title: listing.title,
      date: day,
      endDate: listing.endDate ? new Date(`${listing.endDate}T00:00:00.000Z`) : null,
      time: listing.time,
      endTime: listing.endTime,
      venueName: listing.venueName,
      venueAddress: listing.venueAddress,
      city: listing.city,
      category: listing.category,
      subTags: listing.subTags,
      isLGBTI: listing.isLGBTI,
      description: listing.description,
      price: listing.price,
      isFree: listing.isFree,
      priceMin: listing.priceMin,
      priceMax: listing.priceMax,
      ticketUrl: listing.ticketUrl,
      imageUrl: listing.imageUrl,
      galleryUrls: listing.galleryUrls,
      organiserName: listing.organiserName,
      organiserUrl: listing.organiserUrl,
      accessibilityInfo: listing.accessibilityInfo,
      ageRestriction: listing.ageRestriction,
      transportInfo: listing.transportInfo,
      capacity: listing.capacity,
      suburb: place.suburb,
      latitude: place.lat,
      longitude: place.lng,
      source: 'promoter',
      sources: ['promoter'],
      promoterId: me.id,
      lastVerifiedAt: new Date(),
      seriesKey: makeSeriesKey(listing.title, listing.venueName, listing.city),
      dedupeHash: `promoter-${crypto.randomUUID()}`,
    },
    select: { id: true, imageUrl: true },
  })
  if (event.imageUrl) queueEventImage(event.id)
  return NextResponse.json({ ok: true, id: event.id })
}
