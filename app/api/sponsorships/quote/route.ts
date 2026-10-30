import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/session'
import { isBoostId, isPlanId } from '@/lib/sponsorship'
import { missingTable, saveLead } from '@/lib/sponsorship-store'

export const dynamic = 'force-dynamic'

const emailOk = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

/** Lead capture when card billing is off. This never creates a charge or a live boost. */
export async function POST(req: Request) {
  const me = await getSessionUser().catch(() => null)
  const body = await req.json().catch(() => ({}))
  const kind = body?.kind === 'PLAN' ? 'PLAN' : body?.kind === 'BOOST' ? 'BOOST' : null
  if (!kind) return NextResponse.json({ error: 'Say whether this is a boost or a plan.' }, { status: 400 })
  const email = (typeof body?.email === 'string' && body.email.trim()) || me?.email || ''
  if (!emailOk(email)) return NextResponse.json({ error: 'Add an email so we can send the quote.' }, { status: 400 })
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : ''
  const payload = {
    inventoryId: isBoostId(body?.inventoryId) ? body.inventoryId : null,
    planId: isPlanId(body?.planId) ? body.planId : null,
    eventId: typeof body?.eventId === 'string' ? body.eventId.slice(0, 80) : null,
    headline: typeof body?.headline === 'string' ? body.headline.slice(0, 80) : null,
  }
  try {
    const id = await saveLead({ userId: me?.id, email, kind, note, payload })
    return NextResponse.json({ ok: true, id, charged: false })
  } catch (error) {
    if (missingTable(error)) return NextResponse.json({ error: 'Quotes are not switched on yet.' }, { status: 503 })
    console.error('[sponsorship] quote', error)
    return NextResponse.json({ error: 'Could not save that quote request.' }, { status: 500 })
  }
}
