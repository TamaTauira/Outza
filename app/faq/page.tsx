import type { Metadata } from 'next'
import { InfoPage } from '@/components/info-page'

export const metadata: Metadata = {
  title: 'FAQ — VibePeep',
  description: 'Common questions about VibePeep listings, promotion and accounts.',
}

export default function FaqPage() {
  return (
    <InfoPage
      variant="faq"
      title="FAQ"
      lede="Short answers. The pricing and refund pages have the money details."
      sections={[
        { title: 'Where do I see the source?', body: ['Each event page has one short line: the source, linked when we have a page, and when the listing was updated, next to the times. Use Report a problem if a detail looks wrong.'] },
        { title: 'Why is my suburb pin in the city centre?', body: ['Put the suburb and postcode in the address, for example Fitzroy VIC 3065. The map and Intelligence use that, not the city centre. A CBD postcode such as 3000 or 2000 stays in the CBD.'] },
        { title: 'Can I edit a Ticketmaster or Eventbrite listing?', body: ['No. Those stay as the source published them. Create your own event, or claim the listing if you organise it.'] },
        { title: 'What does Sponsored mean?', body: ['Boost, Spotlight and Headliner are paid placements for the event’s own city, labelled Sponsored. Headliner ranks above Spotlight, which ranks above Boost. Front-row placement is the add-on that can show in every city, still labelled Sponsored.'] },
        { title: 'Where did Outza go?', body: ['VibePeep is the name on the site. The web address can still contain outza. Storage keys and the host name are not the public brand.'] },
      ]}
    />
  )
}
