import type { Metadata } from 'next'
import { InfoPage } from '@/components/info-page'
import { pageMeta } from '@/lib/page-meta'
import { ADDONS } from '@/lib/tiers'

const nationwide = ADDONS.find((addon) => addon.key === 'FRONTROW')

export const metadata: Metadata = pageMeta({
  title: 'FAQ',
  description: 'Quick answers on VibePeep listings, promotion and your account.',
  path: '/faq',
})

export default function FaqPage() {
  return (
    <InfoPage
      variant="faq"
      title="Quick answers"
      lede="Short answers. The pricing and refund pages have the money details."
      sections={[
        { title: 'Where do I see the source?', body: ['Each event page has one short line: the source, linked when we have a page, and when the listing was updated, next to the times. Use Report a problem if a detail looks wrong.'] },
        { title: 'Why is my suburb pin in the city centre?', body: ['Put the suburb and postcode in the address, for example Fitzroy VIC 3065. The map and Intelligence use that, not the city centre. A CBD postcode such as 3000 or 2000 stays in the CBD.'] },
        { title: 'Can I edit a Ticketmaster or Eventbrite listing?', body: ['No. Those stay as the source published them. Create your own event, or claim the listing if you organise it.'] },
        { title: 'What does Sponsored mean?', body: [`Boost, Spotlight, Headliner, evening passes and day passes are paid placements, labelled Sponsored. Headliner ranks above Spotlight, which ranks above Boost. An evening or day pass sits in Coming up next for the hours you buy, and sponsored cards stay a minority whenever other events match. ${nationwide?.name ?? 'The nationwide add-on'} can show in every city, still labelled Sponsored.`] },
      ]}
    />
  )
}
