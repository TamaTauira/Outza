import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { eventPath } from '@/lib/seo'
import { siteUrl } from '@/lib/site-url'
import { METRIC, recordProductMetrics } from '@/lib/product-metrics'

export const dynamic = 'force-dynamic'

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly/i

/** Tracked promoter link. Counts the visit, then opens the event. */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!/^[a-z0-9]{6,12}$/.test(code)) return NextResponse.redirect(siteUrl())
  const link = await prisma.shareLink.findUnique({
    where: { code },
    select: { id: true, eventId: true, event: { select: { id: true, title: true } } },
  }).catch(() => null)
  if (!link) return NextResponse.redirect(siteUrl())
  const ua = req.headers.get('user-agent') ?? ''
  if (!BOT.test(ua)) {
    await prisma.shareLink.update({ where: { id: link.id }, data: { visits: { increment: 1 } } }).catch(() => {})
    await recordProductMetrics([{ name: METRIC.shareVisit, subjectId: link.eventId, subjectKind: 'event', dim: code }])
  }
  return NextResponse.redirect(`${siteUrl()}${eventPath(link.event)}`)
}
