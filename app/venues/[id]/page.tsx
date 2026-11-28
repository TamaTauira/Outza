import type { Metadata } from 'next'
import Link from 'next/link'
import { after } from 'next/server'
import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { sydneyToday } from '@/lib/event-store'
import { MANAGE_VENUE_BLURB, MANAGE_VENUE_LABEL, VENUE_MANAGED_LABEL, ownershipUiEnabled } from '@/lib/ownership'
import { venueKey } from '@/lib/together'
import { bumpVenueMetric, canManageVenue, publicVenue, venueFollowerCount } from '@/lib/venue-access'
import { venueHoursLine } from '@/lib/venue-profile'
import { ClaimedTick } from '@/components/ClaimedTick'
import { EventCard } from '@/components/event-card'
import { PageShell } from '@/components/page-shell'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { FollowVenueButton } from './follow-button'
import { firstHttpsShareUrl, openGraphImage } from '@/lib/share-image'
import { VenueLinks } from './venue-links'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const venue = await publicVenue(id)
  if (!venue) return { title: 'Venue', openGraph: { title: 'Venue · VibePeep' } }
  const title = venue.name
  const description = venue.description?.replace(/\s+/g, ' ').trim()
    ? venue.description.replace(/\s+/g, ' ').trim().slice(0, 200)
    : `What’s on at ${venue.name} in ${venue.city}.`
  const url = `/venues/${venue.id}`
  const image = openGraphImage(firstHttpsShareUrl([venue.photos?.[0], venue.logoUrl]), `${venue.name} on VibePeep`)
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title: `${title} · VibePeep`, description, url, type: 'website', images: [image] },
    twitter: { card: 'summary_large_image', title: `${title} · VibePeep`, description, images: [image] },
  }
}

export default async function VenueProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: routeParam } = await params
  const venue = await publicVenue(routeParam)
  if (!venue) notFound()
  const id = venue.id
  const session = await auth()
  const userId = session?.user?.id
  const access = userId ? await canManageVenue(userId, id) : { allowed: false, role: null }
  const claim = userId
    ? await prisma.venueClaimRequest.findFirst({ where: { venueId: id, claimantUserId: userId }, orderBy: { submittedAt: 'desc' }, select: { status: true } }).catch(() => null)
    : null
  const followKey = venueKey(venue.name, venue.city)
  const [following, followers, upcoming] = await Promise.all([
    userId
      ? prisma.venueFollow.findUnique({ where: { userId_venueKey: { userId, venueKey: followKey } }, select: { userId: true } }).then((row) => !!row).catch(() => false)
      : Promise.resolve(false),
    access.allowed ? venueFollowerCount(id).catch(() => null) : Promise.resolve(null),
    prisma.event.findMany({
      where: { venueId: id, duplicateOfId: null, deletedAt: null, date: { gte: sydneyToday() }, status: { not: 'CANCELLED' } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
      take: 6,
      select: {
        id: true, title: true, date: true, time: true, venueName: true, suburb: true, category: true,
        subTags: true, isLGBTI: true, isFree: true, price: true, priceMin: true, priceMax: true,
        imageUrl: true, venueAddress: true, city: true, ticketUrl: true,
      },
    }).catch(() => []),
  ])
  const tools = ownershipUiEnabled()
  const hours = venueHoursLine(venue)
  const photos = venue.photos ?? []
  after(() => { bumpVenueMetric(id, 'PROFILE_VIEWS').catch(() => {}) })

  return (
    <PageShell>
    <main className="vp-wrap vp-page-top px-4 pb-24 sm:px-6">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-[var(--vp-card-gap)]">
      <div>
      <p className="text-xs text-muted-foreground">{venue.city}</p>
      <h1 className="mt-1 flex flex-wrap items-center gap-2 font-display text-h1">
        {venue.name}
        {venue.managed && <ClaimedTick kind="venue" className="h-5 w-5" />}
      </h1>
      {venue.managed && <p className="mt-2 text-xs text-muted-foreground">{VENUE_MANAGED_LABEL}</p>}
      {photos.length > 0 && (
        <ul className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Photos">
          {photos.map((src) => (
            <li key={src} className="shrink-0">
              <img src={src} alt={`${venue.name}`} className="h-40 w-64 rounded-xl border border-border object-cover sm:h-52 sm:w-80" />
            </li>
          ))}
        </ul>
      )}
      {venue.description && <p className="mt-4 max-w-2xl text-sm text-muted-foreground whitespace-pre-line">{venue.description}</p>}
      {venue.announcement && <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">{venue.announcement}</p>}
      <div className="mt-6 space-y-5 text-sm">
        {venue.address && <p>{venue.address}</p>}
        {hours && (
          <section>
            <h2 className="font-display text-lg font-bold">Hours</h2>
            <p className="mt-1 text-muted-foreground">{hours}</p>
          </section>
        )}
        {venue.accessibilityInfo && (
          <section>
            <h2 className="font-display text-lg font-bold">Accessibility</h2>
            <p className="mt-1 whitespace-pre-line text-muted-foreground">{venue.accessibilityInfo}</p>
          </section>
        )}
        {venue.gettingThere && (
          <section>
            <h2 className="font-display text-lg font-bold">Getting there</h2>
            <p className="mt-1 whitespace-pre-line text-muted-foreground">{venue.gettingThere}</p>
          </section>
        )}
        {!!venue.categories?.length && <p className="text-muted-foreground">{venue.categories.join(' · ')}</p>}
        {!!venue.facilities?.length && <p className="text-muted-foreground">{venue.facilities.join(' · ')}</p>}
      </div>
      <section className="mt-8">
        <h2 className="font-display text-lg font-bold">What’s on</h2>
        {upcoming.length ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {upcoming.map((event, index) => (
              <EventCard key={event.id} index={index} event={{ ...event, date: event.date.toISOString(), subTags: event.subTags ?? [] }} />
            ))}
          </div>
        ) : (
          <EmptyState title="Nothing upcoming yet" body="When a listing is tied to this venue, it shows up here." />
        )}
      </section>
      </div>
      <div className="mt-6 space-y-4 lg:mt-0">
      <FollowVenueButton name={venue.name} city={venue.city} following={following} signedIn={!!userId} nextPath={`/venues/${id}`} />
      <p className="text-xs text-muted-foreground">New listings here can show up in your alerts email, if you’ve asked for those emails.</p>
      {access.allowed && followers != null && (
        <p className="text-sm text-muted-foreground">{followers === 1 ? '1 person follows this venue.' : `${followers} people follow this venue.`}</p>
      )}
      <VenueLinks
        id={id}
        website={venue.website}
        instagram={venue.instagram}
        facebook={venue.facebook}
        phone={venue.contactPhone}
        destination={venue.address || `${venue.name}, ${venue.city}`}
      />
      {tools && (
        <section className="rounded-xl border border-border bg-card p-4">
          {access.allowed ? (
            <Button asChild className="w-full"><Link href={`/venue/${id}`}>{access.role === 'ADMINISTRATOR' ? 'Manage this venue' : 'Venue tools'}</Link></Button>
          ) : claim?.status === 'PENDING' || claim?.status === 'DISPUTE' ? (
            <p className="text-sm text-muted-foreground">Your claim is being checked. Editing stays off until it’s approved.</p>
          ) : venue.managed ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Someone already manages this venue. You can ask for access or tell us the manager is wrong.</p>
              <Link href={`/venues/${id}/claim?dispute=1`} className="text-sm underline">Request access or report a dispute</Link>
            </div>
          ) : (
            <div className="space-y-2">
              <Button asChild className="w-full"><Link href={userId ? `/venues/${id}/claim` : `/login?next=${encodeURIComponent(`/venues/${id}/claim`)}`}>{MANAGE_VENUE_LABEL}</Link></Button>
              <p className="text-sm text-muted-foreground">{MANAGE_VENUE_BLURB}</p>
            </div>
          )}
        </section>
      )}
      </div>
      </div>
    </main>
    </PageShell>
  )
}
