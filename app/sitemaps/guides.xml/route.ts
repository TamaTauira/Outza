import { guidesSitemapXml, xmlHeaders } from '@/lib/sitemap-data'

export const dynamic = 'force-dynamic'

export async function GET() {
  return new Response(await guidesSitemapXml(), { headers: xmlHeaders() })
}
