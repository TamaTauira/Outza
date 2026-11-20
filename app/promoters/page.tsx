import type { Metadata } from 'next'
import { auth } from '@/auth'
import './promoters.css'
import { Footer } from '@/components/footer'
import { PromoterSalesHeader } from '@/components/promoter-sales-header'
import { FaqSection } from './faq-section'
import { DashboardSection, FinalCta, Hero, HowItWorks, ProBand } from './marketing'
import { PromotionStudio } from './promotion-studio'
import { supplySnapshot } from './supply'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'For promoters — VibePeep',
  description: 'Put your event in front of people planning their weekend. List for free. An evening pass is $9. Boost is $19 for a week.',
}

export default async function PromotersPage() {
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role
  const isPromoter = role === 'PROMOTER' || role === 'ADMIN'
  const signedIn = !!session?.user
  const primaryHref = isPromoter || signedIn ? '/promoter' : '/signup?role=promoter'
  const primaryLabel = isPromoter ? 'Open your dashboard' : signedIn ? 'Switch to a promoter account' : 'Claim your free promoter account'
  const finalLabel = primaryLabel
  const supply = await supplySnapshot()
  const proLabel = isPromoter ? 'Get Pro in your dashboard' : 'Go Pro'

  return (
    <div className="min-h-screen bg-background">
      <PromoterSalesHeader accountHref={primaryHref} />
      <main className="vp-promoters vp-page-top">
        <Hero primaryHref={primaryHref} primaryLabel={primaryLabel} showSignIn={!signedIn} supply={supply} />
        <HowItWorks />
        <PromotionStudio isPromoter={isPromoter} />
        <ProBand href={primaryHref} label={proLabel} />
        <DashboardSection />
        <FaqSection />
        <FinalCta href={primaryHref} label={finalLabel} />
      </main>
      <Footer lastRefresh={null} />
    </div>
  )
}
