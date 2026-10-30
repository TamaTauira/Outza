import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { ownershipUiEnabled } from '@/lib/ownership'
import { canManageVenue, publicVenue } from '@/lib/venue-access'
import { VenueDashboard } from './dashboard'

export const dynamic = 'force-dynamic'

export default async function VenueDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  if (!ownershipUiEnabled()) {
    return <main className="max-w-xl mx-auto px-4 py-16 text-sm text-muted-foreground">Venue management is turned off.</main>
  }
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) redirect(`/login?next=${encodeURIComponent(`/venue/${id}`)}`)
  const access = await canManageVenue(session.user.id, id)
  if (!access.allowed) redirect(`/venues/${id}`)
  const venue = await publicVenue(id)
  if (!venue) notFound()
  return <VenueDashboard venueId={id} name={venue.name} city={venue.city} role={access.role || 'MANAGER'} />
}
