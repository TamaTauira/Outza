import { prisma } from '@/lib/prisma'
import { refreshSuccessRate, reportsPerThousand } from '@/lib/listing-window'

export type ListingHealth = {
  reports: number
  views: number
  reportsPerThousand: number | null
  searchClicks: number
  refreshCompleted: number
  refreshFailed: number
  refreshSuccessRate: number | null
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export async function bumpCounter(key: 'search_result_clicks' | 'invalid_reports') {
  await prisma.analyticsCounter.upsert({
    where: { key },
    create: { key, count: 1 },
    update: { count: { increment: 1 } },
  })
}

/** Counts for the trust admin. Rates are null until there is something to divide by. */
export async function loadListingHealth(now = Date.now()): Promise<ListingHealth> {
  const since = new Date(now - WEEK_MS)
  const [reports, views, clicks, logs] = await Promise.all([
    prisma.eventReport.count(),
    prisma.event.aggregate({ _sum: { views: true } }),
    prisma.analyticsCounter.findUnique({ where: { key: 'search_result_clicks' }, select: { count: true } }),
    prisma.refreshLog.groupBy({
      by: ['status'],
      where: { startedAt: { gte: since }, status: { in: ['completed', 'failed'] } },
      _count: true,
    }),
  ])
  const viewTotal = views._sum.views ?? 0
  const completed = logs.find((row) => row.status === 'completed')?._count ?? 0
  const failed = logs.find((row) => row.status === 'failed')?._count ?? 0
  return {
    reports,
    views: viewTotal,
    reportsPerThousand: reportsPerThousand(reports, viewTotal),
    searchClicks: clicks?.count ?? 0,
    refreshCompleted: completed,
    refreshFailed: failed,
    refreshSuccessRate: refreshSuccessRate(completed, failed),
  }
}
