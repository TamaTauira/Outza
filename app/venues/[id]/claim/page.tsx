import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { ownershipUiEnabled } from '@/lib/ownership'
import { publicVenue } from '@/lib/venue-access'
import { ClaimForm } from './claim-form'

export const dynamic = 'force-dynamic'

export default async function VenueClaimPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ dispute?: string }> }) {
  if (!ownershipUiEnabled()) {
    return <main className="max-w-xl mx-auto px-4 py-16 text-sm text-muted-foreground">Venue claiming is turned off.</main>
  }
  const { id } = await params
  const venue = await publicVenue(id)
  if (!venue) notFound()
  const session = await auth()
  if (!session?.user) redirect(`/login?next=${encodeURIComponent(`/venues/${id}/claim`)}`)
  const dispute = (await searchParams).dispute === '1'
  return (
    <main className="max-w-xl mx-auto px-4 sm:px-6 py-6 pb-16">
      <Link href={`/venues/${id}`} className="text-sm text-muted-foreground underline">Back to {venue.name}</Link>
      <h1 className="font-display text-2xl font-bold mt-3">{dispute ? 'Request access' : 'Claim this venue'}</h1>
      <p className="mt-2 text-sm text-muted-foreground">It’s free. We check that you can speak for the venue before anyone can edit the profile. A model does not make that call.</p>
      <dl className="mt-4 text-sm space-y-1">
        <div><dt className="text-muted-foreground inline">Venue </dt><dd className="inline">{venue.name}</dd></div>
        {venue.address && <div><dt className="text-muted-foreground inline">Address </dt><dd className="inline">{venue.address}</dd></div>}
        {venue.website && <div><dt className="text-muted-foreground inline">Website </dt><dd className="inline">{venue.website}</dd></div>}
      </dl>
      <ClaimForm venueId={id} defaultName={session.user.name || ''} defaultEmail={session.user.email || ''} dispute={dispute} />
    </main>
  )
}
