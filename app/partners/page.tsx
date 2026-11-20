import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { Footer } from '@/components/footer'
import { SiteHeader } from '@/components/site-header'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { prisma } from '@/lib/db'
import { loadPartnerEvents, loadPartnerOverview } from '@/lib/partner-data'
import { PARTNER_ROLE, parsePartnerFilters } from '@/lib/partner-scope'
import { PartnerView } from './partner-view'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Source partner | VibePeep', robots: { index: false } }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function PartnerPage({ searchParams }: Props) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login?as=partner&next=/partners')
  const role = session.user.role
  if (role !== PARTNER_ROLE) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="vp-wrap vp-page-top px-4 pb-16">
          <EmptyState
            title="This page is for source partners"
            body="Ticketing platforms and other sources get a read-only overview of the listings VibePeep takes from them. Event owners still claim a listing from the event page. There is no public sign-up for a partner login."
            action={<Button asChild><Link href="/">Back to events</Link></Button>}
          />
        </main>
        <Footer lastRefresh={null} />
      </div>
    )
  }

  const account = await prisma.partnerAccount.findUnique({
    where: { userId: session.user.id },
    include: { sources: { orderBy: { sourceKey: 'asc' } } },
  })
  const scope = (account?.sources ?? []).map((row) => ({ sourceKey: row.sourceKey, hostPatterns: row.hostPatterns }))
  const filters = parsePartnerFilters(await searchParams)

  if (!scope.length) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="vp-wrap vp-page-top px-4 pb-16">
          <EmptyState title="No source is assigned yet" body="This partner login is active, but it is not linked to a source. An admin adds that from the partner page in admin." />
        </main>
        <Footer lastRefresh={null} />
      </div>
    )
  }

  const [overview, list] = await Promise.all([
    loadPartnerOverview({ displayName: account?.displayName || session.user.name || 'Source partner', scope, engagement: filters.engagement }),
    loadPartnerEvents(scope, filters),
  ])

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <PartnerView overview={overview} list={list} filters={filters} />
      <Footer lastRefresh={null} />
    </div>
  )
}
