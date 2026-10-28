import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { sydneyToday } from '@/lib/event-store'

export const dynamic = 'force-dynamic'

/** Promoters directory. ?following=1 limits to promoters the signed-in user follows. */
export async function GET(req: Request) {
  const me = await getSessionUser().catch(() => null)
  const onlyFollowing = new URL(req.url).searchParams.get('following') === '1'
  const followRows = me ? await prisma.promoterFollow.findMany({ where: { followerId: me.id }, select: { promoterId: true } }) : []
  const followed = new Set(followRows.map((f) => f.promoterId))
  try {
    const promoters = await prisma.user.findMany({
      where: { role: { in: ['PROMOTER'] }, ...(onlyFollowing ? { id: { in: [...followed] } } : {}) },
      select: {
        id: true, name: true, orgName: true, bio: true, homeCity: true,
        _count: { select: { followers: true, promotedEvents: { where: { date: { gte: sydneyToday() } } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return NextResponse.json({
      promoters: promoters.map(({ _count, ...p }) => ({
        ...p, followers: _count.followers, upcoming: _count.promotedEvents, following: followed.has(p.id),
      })),
    })
  } catch (err) {
    console.error('Promoters directory failed:', err)
    return NextResponse.json({ promoters: [], notice: 'The promoter directory is unavailable right now.' })
  }
}
