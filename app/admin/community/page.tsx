import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { CommunityAdminClient } from './community-admin-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Community moderation — VibePeep admin', robots: { index: false } }

export default async function AdminCommunityPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?next=/admin/community')
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold">Admins only</h1>
        <p className="text-muted-foreground">This queue is for community submissions.</p>
      </main>
    )
  }
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Community queue</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">Removing a listing hides it and keeps the row, plus every audit note. Nothing here is hard-deleted.</p>
      <CommunityAdminClient />
    </main>
  )
}
