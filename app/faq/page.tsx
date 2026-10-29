import type { Metadata } from 'next'
import { InfoPage } from '@/components/info-page'

export const metadata: Metadata = {
  title: 'FAQ — VibePeep',
  description: 'Common questions about VibePeep listings, promotion and accounts.',
}

export default function FaqPage() {
  return (
    <InfoPage
      title="FAQ"
      lede="Short answers. The pricing and refund pages have the money details."
      sections={[
        { title: 'Why does a new listing not say VibePeep Verified?', body: ['Verified means we re-checked the listing against a source we ingest. An event you just typed is yours, and it is labelled as listed by the organiser. It is not marked Verified until it meets every check on How listings work.'] },
        { title: 'Why is my suburb pin in the city centre?', body: ['Put the suburb and postcode in the address, for example Fitzroy VIC 3065. The map and Intelligence use that, not the city centre. A CBD postcode such as 3000 or 2000 stays in the CBD.'] },
        { title: 'Can I edit a Ticketmaster or Eventbrite listing?', body: ['No. Those stay as the source published them. Create your own event, or claim the listing if you organise it.'] },
        { title: 'What does Sponsored mean?', body: ['Boost, Spotlight and Headliner placements are paid. They are labelled Sponsored on the board and in the Hot strip. Headliner can appear in every city. Boost and Spotlight stay in the event’s city.'] },
        { title: 'Where did Outza go?', body: ['VibePeep is the name on the site. The web address can still contain outza. Storage keys and the host name are not the public brand.'] },
      ]}
    />
  )
}
