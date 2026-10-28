import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { TrustAdminClient } from './trust-admin-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Trust & listings — Outza admin', robots: { index: false } }

export default async function AdminTrustPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?next=/admin/trust')
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return (
      <main className="max-w-xl mx-auto px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold mb-2">Admins only</h1>
        <p className="text-muted-foreground">This page reviews listing reports and organiser claims.</p>
      </main>
    )
  }
  return <TrustAdminClient />
}
