import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { Footer } from '@/components/footer'
import { SiteHeader } from '@/components/site-header'
import { AccountClient } from './account-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your account · VibePeep',
  robots: { index: false, follow: false },
}

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
