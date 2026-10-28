import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Click-through for a recommendation: counts the click, then forwards to the business's site with UTM tags. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ad = await prisma.localAd.findUnique({ where: { id }, select: { url: true, status: true, eventId: true } })
  if (!ad) return NextResponse.redirect(new URL('/', req.url))
  if (ad.status === 'ACTIVE') await prisma.localAd.update({ where: { id }, data: { clicks: { increment: 1 } } }).catch((e) => console.error('local-ad click', e))
  let dest: URL
  try { dest = new URL(ad.url) } catch { return NextResponse.redirect(new URL(`/events/${ad.eventId}`, req.url)) }
  if (!dest.searchParams.has('utm_source')) {
    dest.searchParams.set('utm_source', 'outza')
    dest.searchParams.set('utm_medium', 'referral')
    dest.searchParams.set('utm_campaign', 'local_recommendation')
  }
  return NextResponse.redirect(dest.toString(), 302)
}
