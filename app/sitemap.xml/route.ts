import { sitemapIndexXml, xmlHeaders } from '@/lib/sitemap-data'

export const dynamic = 'force-dynamic'

export async function GET() {
  return new Response(await sitemapIndexXml(), { headers: xmlHeaders() })
}
