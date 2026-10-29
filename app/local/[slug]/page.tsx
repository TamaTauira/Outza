import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound, permanentRedirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { cityDef } from '@/lib/cities'
import { addDaysStr, localCategoryLabel, localPath, occurrences, recurrenceLabel, todayIn, MAX_AHEAD_DAYS } from '@/lib/local-shared'
import { jsonLdString } from '@/lib/seo-server'
import { tzOffset } from '@/lib/seo'
import { publicUrl } from '@/lib/s3'
import { imageAssetSelect, type ClientImage } from '@/lib/images/spec'
import { LocalDetailClient, type LocalDetail } from './local-detail-client'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

/** Loads a live (approved, not expired) listing from "/local/<slug>-<id>" and its upcoming dates. */
const load = cache(async (param: string): Promise<LocalDetail | null> => {
  const id = decodeURIComponent(param).split('-').pop() ?? ''
  if (!id) return null
  const l = await prisma.localListing.findFirst({
    where: { id, status: 'APPROVED', expiresAt: { gte: new Date() } },
    select: { id: true, title: true, category: true, description: true, address: true, suburb: true, postcode: true, city: true, lat: true, lng: true, addressVerified: true, startDate: true, endDate: true, startTime: true, endTime: true, recurrence: true, recurUntil: true, priceNote: true, organiserName: true, websiteUrl: true, sourceName: true, imagePath: true, imageAsset: { select: imageAssetSelect }, createdAt: true },
  })
  if (!l) return null
  const today = todayIn(cityDef(l.city).tz)
  const upcoming = occurrences(l, today, addDaysStr(today, MAX_AHEAD_DAYS))
  if (!upcoming.length) return null
  const { createdAt, imagePath, imageAsset, ...rest } = l
  return { ...rest, imageUrl: imagePath ? publicUrl(imagePath) : null, imageAsset: (imageAsset as ClientImage | null) ?? null, listedAt: createdAt.toISOString(), upcoming, schedule: recurrenceLabel(l), recurring: l.recurrence !== 'NONE' }
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const l = await load((await params).slug)
  if (!l) return { title: 'Listing not found | VibePeep', robots: { index: false } }
  const desc = `${localCategoryLabel(l.category)} in ${l.suburb}, ${l.city} · ${l.schedule}. ${l.description.replace(/\s+/g, ' ').slice(0, 120)}…`
  return {
    title: `${l.title} · ${l.suburb} | VibePeep Local`,
    description: desc,
    alternates: { canonical: localPath(l) },
    openGraph: { title: l.title, description: desc.slice(0, 200), type: 'website', url: localPath(l), ...(l.imageUrl ? { images: [l.imageUrl] } : {}) },
  }
}

/** Old links to a repeat copy of a listing go to the one we keep. */
async function canonicalOf(param: string) {
  const id = decodeURIComponent(param).split('-').pop() ?? ''
  const dup = id ? await prisma.localListing.findFirst({ where: { id, duplicateOfId: { not: null } }, select: { duplicateOfId: true } }) : null
  if (!dup?.duplicateOfId) return null
  return prisma.localListing.findFirst({ where: { id: dup.duplicateOfId, status: 'APPROVED', expiresAt: { gte: new Date() } }, select: { id: true, title: true } })
}

export default async function LocalListingPage({ params, searchParams }: Props) {
  const slug = (await params).slug
  const canon = await canonicalOf(slug)
  if (canon) permanentRedirect(localPath(canon))
  const l = await load(slug)
  if (!l) notFound()
  const q = (await searchParams).date
  const date = typeof q === 'string' && l.upcoming.includes(q) ? q : l.upcoming[0]
  const off = tzOffset(cityDef(l.city).tz, date)
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Event', name: l.title, description: l.description.slice(0, 500),
    startDate: `${date}T${l.startTime}:00${off}`, endDate: `${date}T${l.endTime}:00${off}`,
    ...(l.imageUrl ? { image: [l.imageUrl] } : {}),
    isAccessibleForFree: /\bfree\b/i.test(l.priceNote ?? '') || undefined,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', eventStatus: 'https://schema.org/EventScheduled',
    location: { '@type': 'Place', name: l.address, address: { '@type': 'PostalAddress', streetAddress: l.address, addressLocality: l.suburb, postalCode: l.postcode, addressRegion: cityDef(l.city).state, addressCountry: 'AU' } },
    organizer: { '@type': 'Organization', name: l.organiserName, ...(l.websiteUrl ? { url: l.websiteUrl } : {}) },
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <LocalDetailClient listing={l} date={date} />
    </>
  )
}
