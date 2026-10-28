export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { CITY_NAMES } from '@/lib/cities'
import { prisma } from '@/lib/prisma'
import { sydneyToday } from '@/lib/event-store'

export async function GET(request: NextRequest) {
  try {
    const today = sydneyToday()
    const city = request.nextUrl.searchParams.get('city') ?? ''
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

    return NextResponse.json({
      total,
      categories: categories.map((c: any) => ({ name: c.category, count: c._count })),
      lastRefresh: lastRefresh?.endedAt ?? null,
    })
  } catch (err: any) {
    console.error('Error fetching stats:', err?.message)
    return NextResponse.json({ total: 0, categories: [], lastRefresh: null }, { status: 500 })
  }
}
