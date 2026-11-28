import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { ownershipUiEnabled } from '@/lib/ownership'
import { managedVenueIds, searchVenues } from '@/lib/venue-access'
import { PromoterAppShell } from '@/components/promoter-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export const dynamic = 'force-dynamic'

export default async function VenueHome({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  if (!ownershipUiEnabled()) {
    return <main className="max-w-xl mx-auto px-4 py-16 text-sm text-muted-foreground">Venue management is turned off.</main>
  }
  const session = await auth()
  if (!session?.user?.id) redirect('/login?next=/venue')
  const query = (await searchParams).q?.trim() ?? ''
  const ids = await managedVenueIds(session.user.id).catch(() => [])
  if (ids.length === 1 && !query) redirect(`/venue/${ids[0]}`)
  const venues = ids.length ? await prisma.venue.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, city: true } }) : []
  const matches = query ? await searchVenues(query).catch(() => []) : []
  return (
    <PromoterAppShell>
    <main className="vp-wrap vp-page-top vp-stack px-4 pb-16 sm:px-6">
      <p className="text-xs font-semibold text-primary">Promoter</p>
      <h1 className="mt-1 font-display text-h1">Your venues</h1>
      {venues.length ? (
        <ul className="mt-4 space-y-2">
          {venues.map((venue) => (
            <li key={venue.id}><Link href={`/venue/${venue.id}`} className="block rounded-xl border border-border p-4 hover:bg-muted">{venue.name}<span className="block text-xs text-muted-foreground">{venue.city}</span></Link></li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No venue yet. Open a venue page and choose Manage this Venue. It’s free. Once the claim is approved, past and future listings at that venue stay linked to this account.</p>
      )}
      <section className="mt-8">
        <h2 className="font-display text-h3">Find your venue</h2>
        <form method="get" action="/venue" className="mt-3 flex gap-2">
          <Input name="q" type="search" defaultValue={query} placeholder="Find your venue" aria-label="Find your venue" />
          <Button type="submit">Search</Button>
        </form>
        {query ? (
          matches.length ? (
            <ul className="mt-4 space-y-2">
              {matches.map((venue) => (
                <li key={venue.id}><Link href={`/venues/${venue.id}`} className="block rounded-xl border border-border p-4 hover:bg-muted">{venue.name}<span className="block text-xs text-muted-foreground">{venue.address ? `${venue.address} · ` : ''}{venue.city}</span></Link></li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No venues found for that search.</p>
          )
        ) : null}
      </section>
    </main>
    </PromoterAppShell>
  )
}
