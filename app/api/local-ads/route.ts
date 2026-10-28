import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { MAX_ADS_PER_EVENT, activeAdWhere } from '@/lib/local-ads'

export const dynamic = 'force-dynamic'

/** GET ?eventId=  -> live recommendations beneath an event (public). Counts an impression per load. */
export async function GET(req: Request) {
  const eventId = new URL(req.url).searchParams.get('eventId')
  if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })
  const [ads, me] = await Promise.all([
    prisma.localAd.findMany({
      where: activeAdWhere(eventId), orderBy: { startsAt: 'asc' }, take: MAX_ADS_PER_EVENT,
      select: { id: true, kind: true, businessName: true, blurb: true, address: true, promoterId: true, url: true },
    }),
    getSessionUser(),
  ])
  if (ads.length) prisma.localAd.updateMany({ where: { id: { in: ads.map((a) => a.id) } }, data: { views: { increment: 1 } } }).catch((e) => console.error('local-ad views', e))
  return NextResponse.json({
    ads: ads.map(({ promoterId, url, ...a }) => ({ ...a, host: (() => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' } })(), mine: !!me && me.id === promoterId })),
    slotsLeft: Math.max(0, MAX_ADS_PER_EVENT - ads.length),
    youHaveOne: !!me && ads.some((a) => a.promoterId === me.id),
  })
}
