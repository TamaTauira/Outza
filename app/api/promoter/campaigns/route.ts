import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized, forbidden, isPromoter } from '@/lib/session'
import { isProActive } from '@/lib/promotions'
import { canPauseBoosts, refundEligible, refundWindowHours } from '@/lib/sponsorship'
import { refundCampaign } from '@/lib/sponsorship-billing'
import { activePlan, impressionTotals, listPromoterCampaigns, missingTable, planKeyOf } from '@/lib/sponsorship-store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  try {
    const user = await prisma.user.findUnique({ where: { id: me.id }, select: { proUntil: true } })
    const body = await listPromoterCampaigns(me.id, isProActive(user?.proUntil))
    return NextResponse.json(body)
  } catch (error) {
    if (missingTable(error)) return NextResponse.json({ campaigns: [], ready: false })
    console.error('[sponsorship] list', error)
    return NextResponse.json({ error: 'Could not load boosts.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const body = await req.json().catch(() => ({}))
  const action = body?.action
  const id = typeof body?.id === 'string' ? body.id : ''
  try {
    const sub = await activePlan(me.id)
    const plan = planKeyOf(sub)
    if (action === 'pause' || action === 'resume') {
      if (!canPauseBoosts(plan)) return NextResponse.json({ error: 'Pausing boosts comes with Venue Plus.' }, { status: 403 })
      if (body?.all === true && action === 'pause') {
        const res = await prisma.campaign.updateMany({ where: { promoterId: me.id, status: 'ACTIVE' }, data: { status: 'PAUSED' } })
        return NextResponse.json({ ok: true, count: res.count })
      }
      if (!id) return NextResponse.json({ error: 'Choose a boost.' }, { status: 400 })
      const next = action === 'pause' ? 'PAUSED' : 'ACTIVE'
      const from = action === 'pause' ? 'ACTIVE' : 'PAUSED'
      const res = await prisma.campaign.updateMany({
        where: { id, promoterId: me.id, status: from, endsAt: { gt: new Date() } },
        data: { status: next },
      })
      if (!res.count) return NextResponse.json({ error: 'That boost is not in a state to change.' }, { status: 409 })
      return NextResponse.json({ ok: true })
    }
    if (action === 'refund') {
      if (body?.consent !== true) return NextResponse.json({ error: 'Tick the box to confirm the refund.' }, { status: 400 })
      const row = id ? await prisma.campaign.findFirst({ where: { id, promoterId: me.id } }) : null
      if (!row) return NextResponse.json({ error: 'Boost not found.' }, { status: 404 })
      const totals = await impressionTotals([row.id])
      const decision = refundEligible({
        status: row.status,
        impressions: totals.get(row.id) ?? 0,
        startsAt: row.startsAt,
        now: new Date(),
        windowHours: refundWindowHours(plan),
        paymentMode: row.paymentMode,
        hasPaymentIntent: !!row.stripePaymentIntentId,
      })
      if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: 409 })
      const refunded = await refundCampaign(me.id, row.id)
      if ('error' in refunded) return NextResponse.json({ error: refunded.error }, { status: 409 })
      return NextResponse.json({ ok: true, refunded: true })
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (error) {
    if (missingTable(error)) return NextResponse.json({ error: 'Short boosts are not switched on yet.' }, { status: 503 })
    console.error('[sponsorship] campaign action', error)
    return NextResponse.json({ error: 'Could not update that boost.' }, { status: 500 })
  }
}
