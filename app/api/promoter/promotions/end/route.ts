import { NextResponse } from 'next/server'
import { endActivePromotions, endCampaignMessage } from '@/lib/promotion-end'
import { forbidden, getSessionUser, isPromoter, unauthorized } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const body = await req.json().catch(() => ({}))
  const eventId = typeof body?.eventId === 'string' ? body.eventId : ''
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!eventId && !id) return NextResponse.json({ error: 'Choose a campaign.' }, { status: 400 })
  try {
    const ended = await endActivePromotions({ promoterId: me.id, ...(eventId ? { eventId } : { id }) })
    if (!ended.count) return NextResponse.json({ error: 'That campaign is not live.' }, { status: 409 })
    return NextResponse.json({ ok: true, count: ended.count, message: endCampaignMessage(ended.modes) })
  } catch (error) {
    console.error('[promotions] end', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Could not end that campaign.' }, { status: 500 })
  }
}
