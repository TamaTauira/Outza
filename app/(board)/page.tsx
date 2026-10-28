import type { Metadata } from 'next'
import { jsonLdString } from '@/lib/seo-server'
import { siteUrl } from '@/lib/site-url'

export const metadata: Metadata = { alternates: { canonical: '/' } }

/** One JSON-LD document for the canonical host. The root layout does not emit another. */
export default function Page() {
  const origin = siteUrl()
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: 'Outza',
        url: `${origin}/`,
        inLanguage: 'en-AU',
        description: 'Events, gigs, markets and things to do across Australian cities.',
      },
      {
        '@type': 'Organization',
        name: 'Outza',
        url: `${origin}/`,
        logo: `${origin}/outza-icon.svg`,
        slogan: 'Get out. Get amongst it.',
      },
    ],
  }
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
}
