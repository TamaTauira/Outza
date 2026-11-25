import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { sydneyToday } from '@/lib/event-store'
import { isPublicPromoterProfile, publicListingFilter } from '@/lib/public-promoter'

export const dynamic = 'force-dynamic'

/** Public promoters only. Test, QA, unpublished and personal-only accounts are left out. */
export async function GET(req: Request) {
  const me = await getSessionUser().catch(() => null)
  const onlyFollowing = new URL(req.url).searchParams.get('following') === '1'
  const followRows = me ? await prisma.promoterFollow.findMany({ where: { followerId: me.id }, select: { promoterId: true } }) : []
  const followed = new Set(followRows.map((f) => f.promoterId))
  const listed = publicListingFilter()
  try {
    const promoters = await prisma.user.findMany({
      where: {
        role: 'PROMOTER',
        orgName: { not: null },
        promotedEvents: { some: listed },
        ...(onlyFollowing ? { id: { in: [...followed] } } : {}),
      },
      select: {
        id: true, name: true, orgName: true, email: true, bio: true, homeCity: true,
        _count: {
          select: {
            followers: true,
            promotedEvents: { where: { date: { gte: sydneyToday() }, ...listed } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return NextResponse.json({
      promoters: promoters.flatMap(({ _count, name, email, orgName, ...p }) => {
        if (!isPublicPromoterProfile({ orgName, name, email, publishedListings: 1 })) return []
        return [{
          ...p,
          name: orgName,
          orgName,
          followers: _count.followers,
          upcoming: _count.promotedEvents,
          following: followed.has(p.id),
        }]
      }),
    })
  } catch (err) {
    console.error('Promoters directory failed:', err)
    return NextResponse.json({ promoters: [], notice: 'The promoter directory is unavailable right now.' })
  }
}
