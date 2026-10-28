import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized, forbidden, isPromoter } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** The signed-in promoter's local business recommendations. */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const ads = await prisma.localAd.findMany({
    where: { promoterId: me.id, status: { in: ['ACTIVE', 'PENDING'] } }, orderBy: { createdAt: 'desc' }, take: 200,
    select: { id: true, kind: true, businessName: true, blurb: true, status: true, amountCents: true, paymentMode: true, endsAt: true, views: true, clicks: true, createdAt: true, event: { select: { id: true, title: true, date: true, venueName: true } } },
  })
  return NextResponse.json({ ads })
}
