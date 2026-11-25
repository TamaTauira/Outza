import { CITIES } from '@/lib/cities'
import { navItem } from '@/lib/nav'
import { cityPath } from '@/lib/seo'

export type SiteLink = { href: string; label: string }

/** Footer columns. The sitemap publishes the same hrefs. */
export const EXPLORE_LINKS: SiteLink[] = [
  { href: '/together', label: 'Together' },
  { href: navItem('local').href ?? '/local', label: 'Local' },
  { href: '/how-listings-work', label: 'How listings work' },
]

export const COMPANY_LINKS: SiteLink[] = [
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
  { href: '/faq', label: 'FAQ' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/refunds', label: 'Refunds' },
]

export const LEGAL_LINKS: SiteLink[] = [
  { href: '/terms', label: 'Terms' },
  { href: '/terms/promoters', label: 'Promoter terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/disclaimer', label: 'Disclaimer' },
  { href: '/legal/archive', label: 'Earlier versions' },
  { href: '/accessibility', label: 'Accessibility' },
  { href: '/attributions', label: 'Data sources' },
]

export const FOOTER_CITY_LINKS: SiteLink[] = CITIES.map((city) => ({
  href: cityPath(city),
  label: city.name,
}))

export const LISTING_SOURCES_LINE =
  'Listings from Ticketmaster, Moshtix, Oztix, Eventbrite, Humanitix, Frontier Touring and City of Sydney. Always check times and prices with the organiser.'

export const SITE_DISCLAIMER =
  'VibePeep is an independent listings guide — information only, no warranties.'

/** Every path the footer links to. City guides and the home page are added by the sitemap separately. */
export function footerPaths(): string[] {
  return [...EXPLORE_LINKS, ...COMPANY_LINKS, ...LEGAL_LINKS, ...FOOTER_CITY_LINKS].map((link) => link.href)
}
