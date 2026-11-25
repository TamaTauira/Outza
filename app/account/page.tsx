import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { SiteHeader } from '@/components/site-header'
import { AccountClient } from './account-client'

export const dynamic = 'force-dynamic'

import { pageMeta } from '@/lib/page-meta'

export const metadata: Metadata = pageMeta({
  title: 'Your account',
  path: '/account',
  index: false,
})

export default async function AccountPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?next=/account')
  if ((session.user as { role?: string }).role === 'PROMOTER') redirect('/promoter/settings')
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <AccountClient />
    </div>
  )
}
