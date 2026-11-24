import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { Footer } from '@/components/footer'
import { PromoterAppShell } from '@/components/promoter-shell'
import { SiteHeader } from '@/components/site-header'
import { promoterLoginHref } from '@/lib/promoter-nav'
import { PromoterClient } from './promoter-client'
import { BecomePromoter } from './become-promoter'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Promoter dashboard · VibePeep',
  robots: { index: false, follow: false },
}

export default async function PromoterPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth()
  if (!session?.user) redirect(promoterLoginHref(searchParams ? await searchParams : {}))
  const role = (session.user as { role?: string }).role
  if (role === 'PARTNER') redirect('/partners')
  if (role !== 'PROMOTER' && role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="vp-wrap vp-page-top grid items-center gap-[var(--vp-card-gap)] px-4 pb-16 sm:px-6 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <h1 className="mb-2 font-display text-h1">This bit’s for promoters</h1>
            <p className="mb-6 text-muted-foreground">Flip to a promoter account to list and boost your events. Your saves and follows stay put.</p>
            <BecomePromoter />
          </div>
          <aside className="rounded-xl border border-border bg-card p-6 text-left shadow-sm">
            <p className="font-semibold">Promotion packages</p>
            <p className="mt-2 text-sm text-muted-foreground">List for free. Boost when you’re ready. Zero lock-in.</p>
            <Link href="/promoters" className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline">See packages & pricing</Link>
          </aside>
        </main>
        <Footer lastRefresh={null} />
      </div>
    )
  }
  return (
    <PromoterAppShell>
      <PromoterClient stripeEnabled={!!process.env.STRIPE_SECRET_KEY} />
    </PromoterAppShell>
  )
}
