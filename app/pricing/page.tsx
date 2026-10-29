import type { Metadata } from 'next'
import { InfoPage } from '@/components/info-page'
import { LOCAL_AD, PRO_PLAN, TIERS, formatAud } from '@/lib/tiers'

export const metadata: Metadata = {
  title: 'Pricing — VibePeep',
  description: 'Boost, Spotlight, Headliner, Promoter Pro and local recommendations. AUD, GST inclusive.',
}

export default function PricingPage() {
  return (
    <InfoPage
      title="Pricing"
      lede="All prices are AUD and include GST. Campaigns are one-off. The full comparison, including add-ons, is on the promoter page."
      sections={[
        { title: 'Campaigns', body: TIERS.map((t) => `${t.name}: ${formatAud(t.prices[7])} for 7 days, ${formatAud(t.prices[14])} for 14 days, ${formatAud(t.prices[30])} for 30 days.`) },
        { title: 'Promoter Pro', body: [`${PRO_PLAN.name} is ${formatAud(PRO_PLAN.priceCents)} for ${PRO_PLAN.days} days and takes ${PRO_PLAN.discountPct}% off campaigns bought while it is active. Ending Pro does not refund the current period.`] },
        { title: 'Local recommendations', body: [`A local business recommendation is ${formatAud(LOCAL_AD.priceCents)} and runs until the event ends. One recommendation per event. Cancelling it stops it showing. It is not refunded automatically.`] },
        { title: 'More detail', body: ['Package perks, add-ons and the test-mode note live on the promoter page.'] },
      ]}
    />
  )
}
