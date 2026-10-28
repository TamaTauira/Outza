import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { recordSignal } from '@/lib/event-signals'

export const dynamic = 'force-dynamic'

const COUNTER = { SHARE: 'shares', ITINERARY: 'itineraryAdds' } as const

/** Counts a share or an itinerary add. Signed-in people are counted once per event; guests add to the total only. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const kind = b?.kind === 'SHARE' || b?.kind === 'ITINERARY' ? (b.kind as keyof typeof COUNTER) : null
  if (!kind) return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  const exists = await prisma.event.findUnique({ where: { id }, select: { id: true } })
  if (!exists) return NextResponse.json({ ok: true })
  const me = await getSessionUser()
  const fresh = me ? await recordSignal(me.id, id, kind) : true
  if (fresh) await prisma.event.update({ where: { id }, data: { [COUNTER[kind]]: { increment: 1 } } }).catch((e) => console.error('signal count failed', e?.message))
  return NextResponse.json({ ok: true })
}
