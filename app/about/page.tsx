import type { Metadata } from 'next'
import { InfoPage } from '@/components/info-page'

export const metadata: Metadata = {
  title: 'About — VibePeep',
  description: 'VibePeep is an independent guide to events, experiences and local discoveries across Australia.',
}

export default function AboutPage() {
  return (
    <InfoPage
      title="About VibePeep"
      lede="VibePeep is an independent listings guide. The site is served at outza-outza.vercel.app. The name you see on the board, in emails and on invoices is VibePeep."
      sections={[
        { title: 'What this is', body: ['VibePeep gathers gigs, markets, shows and things to do in ten Australian cities and sorts them by when they start. Listings come from ticketing partners, public guides and organisers who publish their own events.'] },
        { title: 'What this is not', body: ['VibePeep does not sell tickets, run the events, or guarantee that a listing is still accurate. Confirm times, prices and access with the organiser before you go. Paid placements are labelled Sponsored.'] },
        { title: 'For organisers', body: ['Promoters can create a listing, claim one we already have, and buy a Boost, Spotlight or Headliner campaign. Promoter Pro is a 30-day pass. Details and prices are on the pricing page.'] },
      ]}
    />
  )
}
