import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized, forbidden, isPromoter } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** Ends Promoter Pro now. Does not refund the current period. */
export async function POST() {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const now = new Date()
  await prisma.$transaction([
    prisma.user.update({ where: { id: me.id }, data: { proUntil: now } }),
    prisma.proPass.updateMany({ where: { userId: me.id, status: 'ACTIVE' }, data: { status: 'CANCELLED', endsAt: now } }),
  ])
  return NextResponse.json({ ok: true, refunded: false })
}
