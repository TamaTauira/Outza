import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { Footer } from '@/components/footer'
import { SiteHeader } from '@/components/site-header'
import { AccountClient } from './account-client'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?next=/account')
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <AccountClient />
      <Footer lastRefresh={null} />
    </div>
  )
}
