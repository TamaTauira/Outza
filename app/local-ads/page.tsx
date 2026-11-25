import type { Metadata } from 'next'
import { auth } from '@/auth'
import { PromoterSalesHeader } from '@/components/promoter-sales-header'
import { LocalAds } from '@/app/promoters/marketing'
import { pageMeta } from '@/lib/page-meta'
import '../promoters/promoters.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = pageMeta({
  title: 'Local business ads',
  path: '/local-ads',
  description: 'Put a local business beside an event people are already planning to attend. Always labelled Sponsored.',
})

export default async function LocalAdsPage() {
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role
  const isPromoter = role === 'PROMOTER' || role === 'ADMIN'
  const signedIn = !!session?.user
  const accountHref = isPromoter || signedIn ? '/promoter' : '/signup?role=promoter'
  const href = isPromoter ? '/promoter?tab=local' : accountHref
  return (
    <div className="min-h-screen bg-background">
      <PromoterSalesHeader accountHref={accountHref} />
      <main className="vp-promoters vp-page-top">
        <LocalAds href={href} label={isPromoter ? 'Advertise from the dashboard' : 'Advertise my business'} heading="h1" />
      </main>
    </div>
  )
}
