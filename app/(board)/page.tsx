import type { Metadata } from 'next'
import { jsonLdString } from '@/lib/seo-server'
import { BRAND_NAME, BRAND_SUBLINE, BRAND_TAGLINE } from '@/lib/brand'
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
        name: BRAND_NAME,
        url: `${origin}/`,
        inLanguage: 'en-AU',
        description: `${BRAND_SUBLINE} Gigs, markets and things to do across Australian cities.`,
      },
      {
        '@type': 'Organization',
        name: BRAND_NAME,
        url: `${origin}/`,
        logo: `${origin}/vibepeep-icon.svg`,
        slogan: BRAND_TAGLINE,
      },
    ],
  }
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
}
