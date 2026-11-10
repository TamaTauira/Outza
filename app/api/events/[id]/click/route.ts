import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { recordSignal } from '@/lib/event-signals'
import { recordCampaignConversion } from '@/lib/sponsorship-store'

export const dynamic = 'force-dynamic'

/** Records an outbound "Get tickets" or "More info" click for promoter analytics. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const raw = await req.text().catch(() => '')
  let info = false
  try {
    const body = raw ? JSON.parse(raw) as { kind?: string } : {}
    info = body?.kind === 'info'
  } catch { /* older beacons send no body and stay Get tickets */ }
  if (info) {
    const exists = await prisma.event.findUnique({ where: { id }, select: { id: true } })
    if (exists) {
      const { METRIC, recordProductMetrics } = await import('@/lib/product-metrics')
      await recordProductMetrics([{ name: METRIC.info, subjectId: id, subjectKind: 'event' }])
    }
    return NextResponse.json({ ok: true })
  }
  const n = await prisma.event.updateMany({ where: { id }, data: { ticketClicks: { increment: 1 } } }).catch((e) => { console.error('click count failed', e?.message); return { count: 0 } })
  if (n.count) {
    const me = await getSessionUser().catch(() => null)
    if (me) await recordSignal(me.id, id, 'TICKET')
    await recordCampaignConversion(id, 'TICKET', me?.id)
    const { bumpEngagement } = await import('@/lib/engagement-store')
    await bumpEngagement(id, 'TICKET')
    const { METRIC, recordProductMetrics } = await import('@/lib/product-metrics')
    await recordProductMetrics([{ name: METRIC.ticket, subjectId: id, subjectKind: 'event' }])
  }
  return NextResponse.json({ ok: true })
}
