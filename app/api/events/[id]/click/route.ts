import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { recordSignal } from '@/lib/event-signals'

export const dynamic = 'force-dynamic'

/** Records an outbound "Get tickets" click for promoter analytics */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const n = await prisma.event.updateMany({ where: { id }, data: { ticketClicks: { increment: 1 } } }).catch((e) => { console.error('click count failed', e?.message); return { count: 0 } })
  if (n.count) {
    const me = await getSessionUser().catch(() => null)
    if (me) await recordSignal(me.id, id, 'TICKET')
  }
  return NextResponse.json({ ok: true })
}
