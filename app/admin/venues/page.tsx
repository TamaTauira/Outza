import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { VenueAdmin } from './venue-admin-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Venue claims — VibePeep admin', robots: { index: false } }

export default async function AdminVenuesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?next=/admin/venues')
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return <main className="max-w-xl mx-auto px-4 py-16 text-center text-sm">Admins only.</main>
  }
  return (
    <main className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold">Venue claims</h1>
      <p className="text-sm text-muted-foreground mt-1">A person approves these. A model score is not a decision.</p>
      <VenueAdmin />
    </main>
  )
}
