import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { missingRelation } from '@/lib/engagement-store'
import { getSessionUser, unauthorized, forbidden, isPromoter } from '@/lib/session'
import { siteUrl } from '@/lib/site-url'

export const dynamic = 'force-dynamic'

const CHANNELS = new Set(['instagram', 'tiktok', 'facebook', 'stories', 'other', 'link'])

function code(): string {
  return randomBytes(6).toString('base64url').replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase()
}

export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const body = await req.json().catch(() => ({})) as { eventId?: unknown; label?: unknown; channel?: unknown }
  const eventId = typeof body.eventId === 'string' ? body.eventId : ''
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 40) : ''
  const channel = typeof body.channel === 'string' && CHANNELS.has(body.channel) ? body.channel : 'link'
  if (!eventId || label.length < 2) return NextResponse.json({ error: 'Name the link and pick an event.' }, { status: 400 })
  const event = await prisma.event.findFirst({ where: { id: eventId, promoterId: me.id }, select: { id: true } })
  if (!event) return NextResponse.json({ error: 'That event is not on your dashboard.' }, { status: 404 })
  let existing = 0
  try {
    existing = await prisma.shareLink.count({ where: { promoterId: me.id } })
  } catch (err) {
    if (missingRelation(err)) return NextResponse.json({ error: 'Tracked links are not switched on yet.' }, { status: 503 })
    throw err
  }
  if (existing >= 30) return NextResponse.json({ error: 'That’s 30 links. Retire one before adding another.' }, { status: 400 })
  let made: { code: string } | null = null
  for (let attempt = 0; attempt < 4 && !made; attempt++) {
    const next = code()
    if (next.length < 6) continue
    try {
      made = await prisma.shareLink.create({ data: { code: next, eventId, promoterId: me.id, label, channel }, select: { code: true } })
    } catch (err) {
      const prismaCode = (err as { code?: string }).code
      if (prismaCode !== 'P2002') throw err
    }
  }
  if (!made) return NextResponse.json({ error: 'Could not mint that link. Try again.' }, { status: 500 })
  return NextResponse.json({ ok: true, url: `${siteUrl()}/s/${made.code}`, code: made.code })
}
