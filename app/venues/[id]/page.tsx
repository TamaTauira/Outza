import Link from 'next/link'
import { after } from 'next/server'
import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { MANAGE_VENUE_BLURB, MANAGE_VENUE_LABEL, VENUE_MANAGED_LABEL, ownershipUiEnabled } from '@/lib/ownership'
import { bumpVenueMetric, canManageVenue, publicVenue } from '@/lib/venue-access'
import { ClaimedTick } from '@/components/ClaimedTick'
import { VenueLinks } from './venue-links'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const venue = await publicVenue(id)
  return { title: venue ? `${venue.name} — VibePeep` : 'Venue — VibePeep' }
}

export default async function VenueProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const venue = await publicVenue(id)
  if (!venue) notFound()
  const session = await auth()
  const userId = session?.user?.id
  const access = userId ? await canManageVenue(userId, id) : { allowed: false, role: null }
  const claim = userId
    ? await prisma.venueClaimRequest.findFirst({ where: { venueId: id, claimantUserId: userId }, orderBy: { submittedAt: 'desc' }, select: { status: true } }).catch(() => null)
    : null
  const tools = ownershipUiEnabled()
  const hours = venue.openTime && venue.closeTime ? `${venue.openTime}–${venue.closeTime}` : null
  after(() => { bumpVenueMetric(id, 'PROFILE_VIEWS').catch(() => {}) })

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-16">
      <p className="text-xs text-muted-foreground">{venue.city}</p>
      <h1 className="font-display text-3xl font-bold tracking-tight mt-1 flex items-center gap-2 flex-wrap">
        {venue.name}
        {venue.managed && <ClaimedTick kind="venue" className="h-5 w-5" />}
      </h1>
      {venue.managed && <p className="mt-2 text-xs text-muted-foreground">{VENUE_MANAGED_LABEL}</p>}
      {venue.description && <p className="mt-4 text-sm text-muted-foreground whitespace-pre-line">{venue.description}</p>}
      <ul className="mt-4 space-y-1 text-sm">
        {venue.address && <li>{venue.address}</li>}
        {hours && <li>Hours {hours}</li>}
        {venue.categories?.length ? <li>{venue.categories.join(' · ')}</li> : null}
        {venue.facilities?.length ? <li>{venue.facilities.join(' · ')}</li> : null}
        {venue.accessibilityInfo && <li>{venue.accessibilityInfo}</li>}
      </ul>
      {venue.announcement && <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">{venue.announcement}</p>}
      <VenueLinks id={id} website={venue.website} destination={venue.address || `${venue.name}, ${venue.city}`} />
      {tools && (
        <section className="mt-8 rounded-xl border border-border bg-card p-4">
          {access.allowed ? (
            <Link href={`/venue/${id}`} className="font-semibold text-sm">{access.role === 'ADMINISTRATOR' ? 'Manage Venue' : 'Manage Venue'}</Link>
          ) : claim?.status === 'PENDING' || claim?.status === 'DISPUTE' ? (
            <p className="text-sm text-muted-foreground">Your claim is being checked. Editing stays off until it’s approved.</p>
          ) : venue.managed ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Someone already manages this venue. You can ask for access or tell us the manager is wrong.</p>
              <Link href={`/venues/${id}/claim?dispute=1`} className="text-sm underline">Request access or report a dispute</Link>
            </div>
          ) : (
            <div className="space-y-2">
              <Link href={userId ? `/venues/${id}/claim` : `/login?next=${encodeURIComponent(`/venues/${id}/claim`)}`} className="font-semibold text-sm">{MANAGE_VENUE_LABEL}</Link>
              <p className="text-sm text-muted-foreground">{MANAGE_VENUE_BLURB}</p>
            </div>
          )}
        </section>
      )}
    </main>
  )
}
