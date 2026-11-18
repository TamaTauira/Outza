import type { Metadata } from 'next'
import { auth } from '@/auth'
import { Footer } from '@/components/footer'
import { PromoterSalesHeader } from '@/components/promoter-sales-header'
import { LocalAds } from '@/app/promoters/marketing'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Local business ads — VibePeep',
  description: 'Put a local business beside an event people are already planning to attend. Always labelled Sponsored.',
}

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
      <main>
        <LocalAds href={href} label={isPromoter ? 'Advertise from the dashboard' : 'Advertise my business'} />
      </main>
      <Footer lastRefresh={null} />
    </div>
  )
}
