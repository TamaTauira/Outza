import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { Footer } from '@/components/footer'
import { SiteHeader } from '@/components/site-header'
import { PromoterClient } from './promoter-client'
import { BecomePromoter } from './become-promoter'

export const dynamic = 'force-dynamic'

export default async function PromoterPage() {
  const session = await auth()
  if (!session?.user) redirect('/login?next=/promoter')
  const role = (session.user as { role?: string }).role
  if (role !== 'PROMOTER' && role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="vp-wrap grid items-center gap-8 px-4 pb-16 pt-8 lg:grid-cols-2 lg:gap-12 lg:pt-12">
          <div className="text-center lg:text-left">
            <h1 className="mb-2 font-display text-2xl font-bold lg:text-4xl">Promoter accounts only</h1>
            <p className="mb-6 text-muted-foreground">Switch your account to a promoter account to list and promote your events. You&apos;ll keep your saved events and follows.</p>
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
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <PromoterClient stripeEnabled={!!process.env.STRIPE_SECRET_KEY} />
      <Footer lastRefresh={null} />
    </div>
  )
}
