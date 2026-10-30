import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { ownershipUiEnabled } from '@/lib/ownership'
import { managedVenueIds } from '@/lib/venue-access'

export const dynamic = 'force-dynamic'

export default async function VenueHome() {
  if (!ownershipUiEnabled()) {
    return <main className="max-w-xl mx-auto px-4 py-16 text-sm text-muted-foreground">Venue management is turned off.</main>
  }
  const session = await auth()
  if (!session?.user?.id) redirect('/login?next=/venue')
  const ids = await managedVenueIds(session.user.id).catch(() => [])
  if (ids.length === 1) redirect(`/venue/${ids[0]}`)
  const venues = ids.length ? await prisma.venue.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, city: true } }) : []
  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl font-bold">Your venues</h1>
      {venues.length ? (
        <ul className="mt-4 space-y-2">
          {venues.map((venue) => (
            <li key={venue.id}><Link href={`/venue/${venue.id}`} className="block rounded-xl border border-border p-4 hover:bg-muted">{venue.name}<span className="block text-xs text-muted-foreground">{venue.city}</span></Link></li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No venue yet. Open a venue page and choose Manage this Venue. It’s free, and it doesn’t give you the events.</p>
      )}
    </main>
  )
}
