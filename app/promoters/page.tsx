import type { Metadata } from 'next'
import { auth } from '@/auth'
import './promoters.css'
import { Footer } from '@/components/footer'
import { SiteHeader } from '@/components/site-header'
import { FaqSection } from './faq-section'
import { BusinessPlans, DashboardSection, FinalCta, Hero, HowItWorks, LocalAds, PathCards, ProBand } from './marketing'
import { PromotionStudio } from './promotion-studio'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'For promoters — VibePeep',
  description: 'Get your event in front of the people who want to go. Boost, Spotlight and Headliner from $19. List for free.',
}

export default async function PromotersPage() {
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role
  const isPromoter = role === 'PROMOTER' || role === 'ADMIN'
  const signedIn = !!session?.user
  const primaryHref = isPromoter || signedIn ? '/promoter' : '/signup?role=promoter'
  const primaryLabel = isPromoter ? 'Open Promoter Dashboard' : signedIn ? 'Switch to a promoter account' : 'Create your free account'
  const finalLabel = isPromoter ? 'Open Promoter Dashboard' : signedIn ? 'Switch to a promoter account' : 'Create your free promoter account'
  const localHref = isPromoter ? '/promoter?tab=local' : primaryHref
  const localLabel = 'Advertise my business'
  const proLabel = isPromoter ? 'Get Pro in your dashboard' : 'Go Pro'

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="vp-promoters">
        <Hero primaryHref={primaryHref} primaryLabel={primaryLabel} showSignIn={!signedIn} />
        <PathCards />
        <HowItWorks />
        <PromotionStudio isPromoter={isPromoter} />
        <BusinessPlans primaryHref={primaryHref} isPromoter={isPromoter} signedIn={signedIn} />
        <LocalAds href={localHref} label={localLabel} />
        <ProBand href={primaryHref} label={proLabel} />
        <DashboardSection />
        <FaqSection />
        <FinalCta href={primaryHref} label={finalLabel} />
      </main>
      <Footer lastRefresh={null} />
    </div>
  )
}
