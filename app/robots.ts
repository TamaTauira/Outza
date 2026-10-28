import type { MetadataRoute } from 'next'
import { requestOrigin } from '@/lib/seo-server'

export const dynamic = 'force-dynamic'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await requestOrigin()
  return {
    rules: [{
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin', '/account', '/promoter$', '/promoter?', '/itinerary', '/unsubscribe', '/login', '/signup'],
    }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  }
}
