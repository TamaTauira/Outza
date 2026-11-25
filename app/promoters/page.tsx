import type { Metadata } from 'next'
import { auth } from '@/auth'
import './promoters.css'
import { PromoterSalesHeader } from '@/components/promoter-sales-header'
import { FaqSection } from './faq-section'
import { DashboardSection, FinalCta, Hero, HowItWorks, ProBand } from './marketing'
import { PromotionStudio } from './promotion-studio'
import { supplySnapshot } from './supply'
import { TIERS, formatAud } from '@/lib/tiers'
import { cardPaymentsLive } from '@/lib/payments-mode'

const boost = TIERS.find((tier) => tier.key === 'SILVER')!

export const dynamic = 'force-dynamic'
const promoterDescription = `Put your event in front of people planning their weekend. List for free. Boost is ${formatAud(boost.prices[boost.headlineDays])} for ${boost.headlineDays} days.`

export const metadata: Metadata = {
  title: 'For promoters',
  description: promoterDescription,
  alternates: { canonical: '/promoters' },
  openGraph: { title: 'For promoters · VibePeep', description: promoterDescription, url: '/promoters' },
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
  const cardsLive = cardPaymentsLive()

  return (
    <div className="min-h-screen bg-background">
      <PromoterSalesHeader accountHref={primaryHref} />
      <main className="vp-promoters vp-page-top">
        <Hero primaryHref={primaryHref} primaryLabel={primaryLabel} showSignIn={!signedIn} cardsLive={cardsLive} supply={supply} />
        <HowItWorks cardsLive={cardsLive} />
        <PromotionStudio isPromoter={isPromoter} cardsLive={cardsLive} />
        <ProBand href={primaryHref} label={proLabel} />
        <DashboardSection />
        <FaqSection cardsLive={cardsLive} />
        <FinalCta href={primaryHref} label={finalLabel} />
      </main>
    </div>
  )
}
