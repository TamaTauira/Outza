import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { endCampaignMessage } from '@/lib/promotion-end'
import { endActivePromotions } from '@/lib/promotion-end-server'
import { forbidden, getSessionUser, unauthorized } from '@/lib/session'
import { productName } from '@/lib/tiers'

export const dynamic = 'force-dynamic'

async function admin() {
  const me = await getSessionUser()
  if (!me) return { error: unauthorized() }
  if (me.role !== 'ADMIN') return { error: forbidden() }
  return { me }
}

export async function GET() {
  const gate = await admin()
  if ('error' in gate && gate.error) return gate.error
  const now = new Date()
  const rows = await prisma.promotion.findMany({
    where: { status: 'ACTIVE', endsAt: { gt: now } },
    orderBy: { endsAt: 'asc' },
    take: 40,
    select: {
      id: true,
      eventId: true,
      tier: true,
      days: true,
      paymentMode: true,
      endsAt: true,
      amountCents: true,
      event: { select: { title: true } },
    },
  })
  return NextResponse.json({
    campaigns: rows.map((row) => ({
      id: row.id,
      eventId: row.eventId,
      title: row.event.title,
      product: productName(row.tier),
      tier: row.tier,
      days: row.days,
      paymentMode: row.paymentMode,
      endsAt: row.endsAt,
      amountCents: row.amountCents,
    })),
  })
}

export async function POST(req: Request) {
  const gate = await admin()
  if ('error' in gate && gate.error) return gate.error
  const body = await req.json().catch(() => ({}))
  const eventId = typeof body?.eventId === 'string' ? body.eventId : ''
  if (!eventId) return NextResponse.json({ error: 'Choose a campaign.' }, { status: 400 })
  try {
    const ended = await endActivePromotions({ eventId })
    if (!ended.count) return NextResponse.json({ error: 'That campaign is not live.' }, { status: 409 })
    return NextResponse.json({ ok: true, count: ended.count, message: endCampaignMessage(ended.modes) })
  } catch (error) {
    console.error('[admin] end promotion', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Could not end that campaign.' }, { status: 500 })
  }
}
