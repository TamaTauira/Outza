import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { jsonLdString } from '@/lib/seo-server'
import { BRAND_ICON_512, BRAND_NAME, BRAND_SUBLINE, BRAND_TAGLINE } from '@/lib/brand'
import { SITE_SAME_AS } from '@/lib/site-social'
import { CITY_NAMES } from '@/lib/cities'
import { siteUrl } from '@/lib/site-url'
import { brandedTitle } from '@/lib/page-meta'

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers()
  const raw = h.get('x-vercel-ip-city')
  const decoded = raw ? decodeURIComponent(raw).trim() : ''
  const city = CITY_NAMES.find((name) => name.toLowerCase() === decoded.toLowerCase()) ?? 'Sydney'
  const title = `What’s on in ${city}: events, gigs and things to do`
  return {
    title,
    alternates: { canonical: '/' },
    openGraph: { title: brandedTitle(title), url: '/' },
  }
}

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
        description: `${BRAND_SUBLINE} The friend who knows what’s on: gigs, markets and things to do across Australian cities.`,
      },
      {
        '@type': 'Organization',
        name: BRAND_NAME,
        url: `${origin}/`,
        logo: `${origin}${BRAND_ICON_512.split('?')[0]}`,
        slogan: BRAND_TAGLINE,
        sameAs: [...SITE_SAME_AS],
      },
    ],
  }
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
}
