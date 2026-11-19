import { composeWatchEmail } from '@/lib/watch-shared'
import { CANONICAL_SITE_URL } from '@/lib/site-url'

/** Sample digest for the preview route. Dates are still ahead of the Sunday morning the old mail went out. */
export function sampleWatchEmail() {
  const home = CANONICAL_SITE_URL
  const mail = composeWatchEmail({
    homeHref: home,
    manageHref: `${home}/account`,
    unsubscribeHref: `${home}/unsubscribe`,
    // Sample cards use "#" so the preview does not link at fabricated event slugs.
    saved: [{
      id: 'harbour-hoopla',
      title: 'Harbour Hoopla Boat Party 2026!',
      when: 'Sat 7 Nov · 12:00 pm – 4:00 pm',
      venue: 'Pirrama Park (Near Tied to Tide sculpture), Sydney',
      href: '#',
      image: null,
      category: 'Community',
      claimed: 'venue',
    }],
    matches: [
      {
        id: 'sample-cinema',
        title: 'Cinema at Sydney Opera House',
        when: 'Sat 7 Nov · 7:00 pm',
        venue: 'Sydney Opera House, Sydney',
        href: '#',
        image: null,
        price: '$26–$39',
        priceKind: 'paid',
        category: 'Arts & Culture',
      },
      {
        id: 'sample-market',
        title: 'Saturday market at Carriageworks',
        when: 'Sat 7 Nov · 10:00 am – 2:00 pm',
        venue: 'Carriageworks, Eveleigh, Sydney',
        href: '#',
        price: 'from $12',
        priceKind: 'paid',
        category: 'Food & Drink',
      },
    ],
  })
  if (!mail) throw new Error('Sample digest was empty')
  return mail
}
