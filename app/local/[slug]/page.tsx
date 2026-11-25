import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { cityDef } from '@/lib/cities'
import { localCategoryLabel, localPath } from '@/lib/local-shared'
import { jsonLdString } from '@/lib/seo-server'
import { tzOffset } from '@/lib/seo'
import { openGraphImage } from '@/lib/share-image'
import { canonicalLocalListing, loadLocalListing } from '../listing-load'
import { LocalDetailClient } from './local-detail-client'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const l = await loadLocalListing((await params).slug)
  if (!l) return { title: 'Listing not found', robots: { index: false }, openGraph: { title: 'Listing not found · VibePeep' } }
  const desc = `${localCategoryLabel(l.category)} in ${l.suburb}, ${l.city} · ${l.schedule}. ${l.description.replace(/\s+/g, ' ').slice(0, 120)}…`
  const image = openGraphImage(l.imageUrl, l.title)
  return {
    title: `${l.title} · ${l.suburb}`,
    description: desc,
    alternates: { canonical: localPath(l) },
    openGraph: { title: `${l.title} · ${l.suburb} · VibePeep`, description: desc.slice(0, 200), type: 'website', url: localPath(l), images: [image] },
    twitter: { card: 'summary_large_image', title: `${l.title} · ${l.suburb} · VibePeep`, description: desc.slice(0, 200), images: [image] },
  }
}

export default async function LocalListingPage({ params, searchParams }: Props) {
  const slug = (await params).slug
  const canon = await canonicalLocalListing(slug)
  if (canon) permanentRedirect(canon)
  const l = await loadLocalListing(slug)
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
