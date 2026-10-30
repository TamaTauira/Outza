import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { loadManagedListing } from '@/lib/community'
import { CommunityManageForm } from '../manage-form'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Manage your listing | VibePeep', robots: { index: false, follow: false } }

export default async function ManageListingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const listing = await loadManagedListing(token).catch(() => null)
  if (!listing) notFound()
  const plain = JSON.parse(JSON.stringify(listing))
  return (
    <div className="min-h-screen bg-background">
      <Navbar savedCount={0} />
      <main className="mx-auto max-w-xl px-4 py-6 sm:px-6">
        <p className="text-sm"><Link href="/local" className="text-muted-foreground">Local</Link></p>
        <h1 className="mt-2 font-display text-3xl font-bold">Your listing, your call</h1>
        <p className="mt-2 text-sm text-muted-foreground">Postpone it, cancel it, or fix the details. Taking it off the public page from here marks it cancelled. An admin removal keeps the audit trail.</p>
        <div className="mt-6">
          <CommunityManageForm token={token} listing={plain} />
        </div>
      </main>
      <Footer lastRefresh={null} />
    </div>
  )
}
