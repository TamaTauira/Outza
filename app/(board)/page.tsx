import type { Metadata } from 'next'
import { requestOrigin, jsonLdString } from '@/lib/seo-server'

export const metadata: Metadata = { alternates: { canonical: '/' } }

export default async function Page() {
  const origin = await requestOrigin()
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Outza',
      url: `${origin}/`,
      inLanguage: 'en-AU',
      description: 'Events, gigs, markets and things to do across Australian cities.',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Outza',
      url: `${origin}/`,
      logo: `${origin}/outza-icon.svg`,
      slogan: 'Get out. Get amongst it.',
    },
  ]
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
}
