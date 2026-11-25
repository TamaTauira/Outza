import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { IntelAdminClient } from './intel-admin-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Intelligence data sources', robots: { index: false }, openGraph: { title: 'Intelligence data sources · VibePeep' } }

export default async function AdminIntelPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?next=/admin/intel')
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return (
      <main className="max-w-xl mx-auto px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold mb-2">Admins only</h1>
        <p className="text-muted-foreground">This page manages VibePeep Intelligence data imports.</p>
      </main>
    )
  }
  return <IntelAdminClient />
}
