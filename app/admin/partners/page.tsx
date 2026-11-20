import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { listPartnerAccounts } from '@/lib/partner-data'
import { PartnersAdminClient } from './partners-admin-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Source partners — VibePeep admin', robots: { index: false } }

export default async function AdminPartnersPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?next=/admin/partners')
  if (session.user.role !== 'ADMIN') {
    return (
      <main className="max-w-xl mx-auto px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold mb-2">Admins only</h1>
        <p className="text-muted-foreground">Partner logins are created here, not from the public sign-up.</p>
      </main>
    )
  }
  const partners = await listPartnerAccounts()
  return (
    <main className="vp-page-top max-w-5xl mx-auto px-4 pb-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Source partners</h1>
      <p className="mt-1 mb-6 text-muted-foreground">A partner sees every listing stored from their source, including past and hidden rows. They cannot edit listings or see another source.</p>
      <PartnersAdminClient initial={partners} />
    </main>
  )
}
