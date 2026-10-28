import { eventsSitemapXml, xmlHeaders } from '@/lib/sitemap-data'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ page: string }> }) {
  const { page } = await ctx.params
  const n = Number(page.replace(/\.xml$/, ''))
  if (!Number.isInteger(n) || n < 1 || n > 50) {
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }
  return new Response(await eventsSitemapXml(n), { headers: xmlHeaders() })
}
