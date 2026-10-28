import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site-url'

export const revalidate = 3600

/**
 * Public pages are allowed. /promoters is explicitly allowed so it is not swallowed by /promoter.
 * No Host: line — that directive is not part of the robots standard and was pointing at the wrong site.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = siteUrl()
  return {
    rules: {
      userAgent: '*',
      allow: ['/promoters', '/'],
      disallow: ['/api/', '/admin', '/account', '/promoter', '/itinerary', '/unsubscribe', '/login', '/signup', '/saved'],
    },
    sitemap: `${origin}/sitemap.xml`,
  }
}
