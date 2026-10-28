import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized, forbidden, isPromoter } from '@/lib/session'
import { suburbFromAddress } from '@/lib/cities'
import { makeSeriesKey } from '@/lib/event-store'
import { parsePriceRange } from '@/lib/quality'
import { bestSourceUrl } from '@/lib/images/source-url'
import { queueEventImage } from '@/lib/images/runner'

export const dynamic = 'force-dynamic'

/** The organiser edits their own listing. Edited listings are protected from source refreshes. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const { id } = await params
  const ev = await prisma.event.findUnique({ where: { id }, select: { id: true, promoterId: true, city: true, imageUrl: true } })
  if (!ev) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (ev.promoterId !== me.id && me.role !== 'ADMIN') return forbidden()

  const b = await req.json().catch(() => ({}))
  const title = String(b.title ?? '').trim().slice(0, 250)
  const date = String(b.date ?? '')
  const venueName = String(b.venueName ?? '').trim().slice(0, 200)
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !venueName) {
    return NextResponse.json({ error: 'Title, date and venue are required' }, { status: 400 })
  }
  const txt = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max) || null
  const url = (v: unknown) => (/^https?:\/\//.test(String(v ?? '')) ? String(v).slice(0, 500) : null)
  const time = /^\d{2}:\d{2}$/.test(b.time ?? '') ? b.time : null
  const endTime = /^\d{2}:\d{2}$/.test(b.endTime ?? '') ? b.endTime : null
  const venueAddress = txt(b.venueAddress, 300)
  const price = txt(b.price, 60)
  const isFree = !!b.isFree || /^free$/i.test(price ?? '')
  const range = parsePriceRange(isFree, price)
  const imageUrl = url(b.imageUrl) ? bestSourceUrl(url(b.imageUrl)!) : null

  await prisma.event.update({
    where: { id },
    data: {
      title, date: new Date(`${date}T00:00:00.000Z`), time, endTime, venueName, venueAddress,
      suburb: suburbFromAddress(venueAddress) ?? ev.city,
      description: txt(b.description, 2000), price: isFree ? 'Free' : price, isFree, priceMin: range.min, priceMax: range.max,
      ticketUrl: url(b.ticketUrl), organiserName: txt(b.organiserName, 160), organiserUrl: url(b.organiserUrl),
      accessibilityInfo: txt(b.accessibilityInfo, 1000), ageRestriction: txt(b.ageRestriction, 120), transportInfo: txt(b.transportInfo, 1000),
      seriesKey: makeSeriesKey(title, venueName, ev.city),
      ...(imageUrl && imageUrl !== ev.imageUrl ? { imageUrl, imageAssetId: null } : {}),
      organiserEditedAt: new Date(), lastVerifiedAt: new Date(),
    },
  })
  if (imageUrl && imageUrl !== ev.imageUrl) queueEventImage(id)
  return NextResponse.json({ ok: true })
}
