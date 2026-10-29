import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized, forbidden, isPromoter } from '@/lib/session'
import { makeSeriesKey } from '@/lib/event-store'
import { promoterCanEditEvent, sourceLabel } from '@/lib/quality'
import { queueEventImage } from '@/lib/images/runner'
import { parsePromoterListing } from '@/lib/promoter-listing'
import { resolveListingPlace } from '@/lib/venue-place'

export const dynamic = 'force-dynamic'

/** The organiser edits their own listing. Edited listings are protected from source refreshes. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const { id } = await params
  const ev = await prisma.event.findUnique({ where: { id }, select: { id: true, promoterId: true, city: true, imageUrl: true, source: true } })
  if (!ev) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (ev.promoterId !== me.id && me.role !== 'ADMIN') return forbidden()
  if (!promoterCanEditEvent(ev.source)) {
    return NextResponse.json({ error: `This listing comes from ${sourceLabel(ev.source)} and can’t be edited. Create your own event, or add a Local listing or business ad, to change details.` }, { status: 403 })
  }

  const b = await req.json().catch(() => ({}))
  const parsed = parsePromoterListing({ ...b, city: b.city ?? ev.city })
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const listing = parsed.listing
  const place = await resolveListingPlace({ venueAddress: listing.venueAddress, venueName: listing.venueName, city: listing.city })

  await prisma.event.update({
    where: { id },
    data: {
      title: listing.title,
      date: new Date(`${listing.date}T00:00:00.000Z`),
      endDate: listing.endDate ? new Date(`${listing.endDate}T00:00:00.000Z`) : null,
      time: listing.time,
      endTime: listing.endTime,
      venueName: listing.venueName,
      venueAddress: listing.venueAddress,
      city: listing.city,
      category: listing.category,
      subTags: listing.subTags,
      isLGBTI: listing.isLGBTI,
      suburb: place.suburb,
      latitude: place.lat,
      longitude: place.lng,
      description: listing.description,
      price: listing.price,
      isFree: listing.isFree,
      priceMin: listing.priceMin,
      priceMax: listing.priceMax,
      ticketUrl: listing.ticketUrl,
      organiserName: listing.organiserName,
      organiserUrl: listing.organiserUrl,
      accessibilityInfo: listing.accessibilityInfo,
      ageRestriction: listing.ageRestriction,
      transportInfo: listing.transportInfo,
      capacity: listing.capacity,
      galleryUrls: listing.galleryUrls,
      seriesKey: makeSeriesKey(listing.title, listing.venueName, listing.city),
      ...(listing.imageUrl && listing.imageUrl !== ev.imageUrl ? { imageUrl: listing.imageUrl, imageAssetId: null } : listing.imageUrl === null ? { imageUrl: null, imageAssetId: null } : {}),
      organiserEditedAt: new Date(),
      lastVerifiedAt: new Date(),
    },
  })
  if (listing.imageUrl && listing.imageUrl !== ev.imageUrl) queueEventImage(id)
  await prisma.intelCache.deleteMany({ where: { key: { contains: id } } }).catch(() => {})
  return NextResponse.json({ ok: true })
}

/** Unpublish a listing the promoter created. Ingested listings stay as the source published them. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const { id } = await params
  const ev = await prisma.event.findUnique({ where: { id }, select: { id: true, promoterId: true, source: true } })
  if (!ev) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (ev.promoterId !== me.id && me.role !== 'ADMIN') return forbidden()
  if (!promoterCanEditEvent(ev.source)) {
    return NextResponse.json({ error: 'Only listings you created can be unpublished.' }, { status: 403 })
  }
  await prisma.event.update({
    where: { id },
    data: { status: 'CANCELLED', statusSource: 'promoter', organiserEditedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
