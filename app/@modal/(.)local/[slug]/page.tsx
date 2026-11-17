import { notFound, permanentRedirect } from 'next/navigation'
import { EventPeek } from '@/components/event-peek'
import { cityDef } from '@/lib/cities'
import { localCategoryLabel, localPath, localToBoard } from '@/lib/local-shared'
import { canonicalLocalListing, loadLocalListing } from '@/app/local/listing-load'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

/** Same event pop-up as the homepage, over the Local list. A refresh still opens the full listing. */
export default async function LocalPeekPage({ params, searchParams }: Props) {
  const slug = (await params).slug
  const canon = await canonicalLocalListing(slug)
  if (canon) permanentRedirect(canon)
  const listing = await loadLocalListing(slug)
  if (!listing) notFound()
  const q = (await searchParams).date
  const date = typeof q === 'string' && listing.upcoming.includes(q) ? q : listing.upcoming[0]
  const row = localToBoard({ ...listing, date, description: listing.description, address: listing.address })
  const city = cityDef(listing.city)
  return (
    <EventPeek
      fullHref={localPath(listing, date)}
      surface="local"
      event={{
        id: row.id,
        title: listing.title,
        description: listing.description,
        date,
        endDate: listing.endDate,
        time: listing.startTime,
        endTime: listing.endTime,
        venueName: listing.address,
        venueAddress: [listing.address, listing.suburb, listing.postcode, city.state].filter(Boolean).join(', '),
        suburb: listing.suburb,
        city: listing.city,
        category: localCategoryLabel(listing.category),
        subTags: [listing.schedule],
        isFree: row.isFree,
        price: listing.priceNote,
        imageUrl: listing.imageUrl,
        imageAsset: listing.imageAsset,
        latitude: listing.lat,
        longitude: listing.lng,
        ticketUrl: listing.websiteUrl,
        sourceUrl: listing.websiteUrl,
        source: listing.sourceName,
        communityKey: listing.category,
      }}
    />
  )
}
