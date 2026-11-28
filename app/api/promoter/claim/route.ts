import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized, forbidden, isPromoter } from '@/lib/session'
import { submitGatedClaim } from '@/lib/claims'

export const dynamic = 'force-dynamic'

/** body: { eventId, orgName?, position?, evidenceUrl?, message? } — claims an existing listing; it joins the dashboard once the organiser is verified. Same gate and evidence as the event-page claim panel, via submitGatedClaim. */
export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const b = await req.json().catch(() => ({}))
  if (typeof b.eventId !== 'string') return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  const u = await prisma.user.findUnique({ where: { id: me.id }, select: { orgName: true } })
  const r = await submitGatedClaim(me, b.eventId, { orgName: u?.orgName || me.name, ...b })
  return NextResponse.json(r.body, { status: r.status })
}
