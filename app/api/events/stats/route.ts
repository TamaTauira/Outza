export const dynamic = 'force-dynamic'

import { unstable_cache } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { CITY_NAMES } from '@/lib/cities'
import { prisma } from '@/lib/prisma'
import { sydneyToday } from '@/lib/event-store'
import { publicCacheHeaders } from '@/lib/http-cache'

const cachedStats = unstable_cache(async (city: string, day: string) => {
  const today = new Date(`${day}T00:00:00.000Z`)
  const cityWhere = city && CITY_NAMES.includes(city) ? { city } : {}
  const [total, categories, lastRefresh] = await Promise.all([
    prisma.event.count({ where: { date: { gte: today }, ...cityWhere } }),
    prisma.event.groupBy({
      by: ['category'],
      _count: true,
      where: { date: { gte: today }, ...cityWhere },
      orderBy: { _count: { category: 'desc' } },
    }),
    prisma.refreshLog.findFirst({
      where: { status: 'completed' },
      orderBy: { endedAt: 'desc' },
    }),
  ])
  return {
    total,
    categories: categories.map((c) => ({ name: c.category, count: c._count })),
    lastRefresh: lastRefresh?.endedAt?.toISOString() ?? null,
  }
}, ['event-stats-v1'], { revalidate: 60 })

export async function GET(request: NextRequest) {
  try {
    const city = request.nextUrl.searchParams.get('city') ?? ''
    const day = sydneyToday().toISOString().slice(0, 10)
    const stats = await cachedStats(city, day)
    return NextResponse.json(stats, { headers: publicCacheHeaders(60) })
  } catch (err: any) {
    console.error('Error fetching stats:', err?.message)
    return NextResponse.json({ total: 0, categories: [], lastRefresh: null }, { status: 500 })
  }
}
