import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verify } from '@/lib/newsletter/links'

export const dynamic = 'force-dynamic'
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

/** Open pixel. Opens are approximate (image blocking, Apple Mail Privacy Protection), so clicks drive decisions. */
export async function GET(req: NextRequest) {
  const s = req.nextUrl.searchParams.get('s') ?? ''
  if (s && verify(req.nextUrl.searchParams.get('k'), s, 'open')) {
    await prisma.newsletterSend.updateMany({ where: { id: s, openedAt: null }, data: { openedAt: new Date() } }).catch(() => {})
  }
  return new Response(new Uint8Array(GIF), { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, max-age=0' } })
}
