import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { CITIES } from '@/lib/cities'
import { TOPICS, MIN_INDEX, cityPath, cityToday, addDaysKey, type TopicKey } from '@/lib/seo'
import { citySuburbs, lastRefreshAt, topicTotal } from '@/lib/seo-server'

/**
 * Admin SEO report built ONLY from data Outza actually holds (database + page rules).
 * Search Console / Bing metrics (impressions, clicks, rankings, queries) are not available until an API
 * connection exists, so they are reported as "not connected" rather than estimated.
 */
export interface SeoReport {
  generatedAt: string
  lastRefresh: string | null
  verification: { google: boolean; bing: boolean }
  pages: { city: string; topic: TopicKey; label: string; path: string; total: number; indexed: boolean }[]
  suburbs: { city: string; count: number }[]
  sitemap: { guides: number; suburbs: number; events: number; local: number; static: number }
  technical: { label: string; count: number; note: string }[]
  referrals: { source: string; visits: number }[]
  organic: { visits: number; events: number; viewsOnThoseEvents: number; ticketClicksOnThoseEvents: number }
  overall: { views: number; ticketClicks: number }
  topOrganic: { id: string; title: string; city: string; visits: number }[]
  opportunities: { city: string; label: string; path: string; total: number; needed: number }[]
}

export async function getSeoReport(): Promise<SeoReport> {
  const now = new Date()
  const earliest = CITIES.map((c) => cityToday(c)).sort()[0]
  const fromDay = new Date(`${earliest}T00:00:00Z`)
  const upcoming: Prisma.EventWhereInput = {
    duplicateOfId: null, status: { not: 'CANCELLED' },
    OR: [{ date: { gte: fromDay } }, { endDate: { gte: fromDay } }],
    date: { lte: new Date(`${addDaysKey(earliest, 365)}T00:00:00Z`) },
  }

  const pages: SeoReport['pages'] = []
  const suburbs: SeoReport['suburbs'] = []
  for (const city of CITIES) {
    for (const t of TOPICS) {
      const total = await topicTotal(city, t)
      pages.push({ city: city.name, topic: t.key, label: t.label, path: cityPath(city, t.key), total, indexed: total >= MIN_INDEX })
    }
    suburbs.push({ city: city.name, count: (await citySuburbs(city)).length })
  }

  const [upcomingCount, noDesc, noImage, pastInDb, dupes, cancelled, localLive, refs, organicRows, overall, refreshAt] = await Promise.all([
    prisma.event.count({ where: upcoming }),
    prisma.event.count({ where: { AND: [upcoming, { OR: [{ description: null }, { description: '' }] }] } }),
    prisma.event.count({ where: { AND: [upcoming, { imageUrl: null, imageAssetId: null }] } }),
    prisma.event.count({ where: { date: { lt: fromDay }, OR: [{ endDate: null }, { endDate: { lt: fromDay } }] } }),
    prisma.event.count({ where: { duplicateOfId: { not: null } } }),
    prisma.event.count({ where: { status: 'CANCELLED', date: { gte: fromDay } } }),
    prisma.localListing.count({ where: { status: 'APPROVED', expiresAt: { gte: now }, duplicateOfId: null } }),
    prisma.eventReferral.groupBy({ by: ['source'], _sum: { count: true } }),
    prisma.eventReferral.findMany({ where: { source: 'SEARCH', count: { gt: 0 } }, orderBy: { count: 'desc' }, take: 500, select: { count: true, event: { select: { id: true, title: true, city: true, views: true, ticketClicks: true } } } }),
    prisma.event.aggregate({ _sum: { views: true, ticketClicks: true } }),
    lastRefreshAt(),
  ])

  const guides = pages.filter((p) => p.indexed).length
  const suburbPages = suburbs.reduce((s, x) => s + x.count, 0)
  const thin = pages.filter((p) => !p.indexed)

  return {
    generatedAt: now.toISOString(),
    lastRefresh: refreshAt?.toISOString() ?? null,
    verification: { google: !!process.env.GOOGLE_SITE_VERIFICATION, bing: !!process.env.BING_SITE_VERIFICATION },
    pages,
    suburbs,
    sitemap: { static: 4, guides, suburbs: suburbPages, events: Math.min(upcomingCount, 20000), local: localLive },
    technical: [
      { label: 'Thin guide pages (noindexed)', count: thin.length, note: `Fewer than ${MIN_INDEX} live listings: kept out of the sitemap and guide links, served with noindex,follow.` },
      { label: 'Upcoming events without a description', count: noDesc, note: 'Pages still index, but a description gives search engines more to work with.' },
      { label: 'Upcoming events without artwork', count: noImage, note: 'Category fallback art is shown; no image is included in event structured data.' },
      { label: 'Past events still stored', count: pastInDb, note: 'Served as noindex,follow archive pages, excluded from sitemaps and guides.' },
      { label: 'Duplicate listings', count: dupes, note: 'Canonicalised to their master listing and noindexed.' },
      { label: 'Upcoming cancelled events', count: cancelled, note: 'Excluded from guides and the sitemap.' },
    ],
    referrals: refs.map((r) => ({ source: r.source, visits: r._sum.count ?? 0 })).sort((a, b) => b.visits - a.visits),
    organic: {
      visits: organicRows.reduce((s, r) => s + r.count, 0),
      events: organicRows.length,
      viewsOnThoseEvents: organicRows.reduce((s, r) => s + r.event.views, 0),
      ticketClicksOnThoseEvents: organicRows.reduce((s, r) => s + r.event.ticketClicks, 0),
    },
    overall: { views: overall._sum.views ?? 0, ticketClicks: overall._sum.ticketClicks ?? 0 },
    topOrganic: organicRows.slice(0, 15).map((r) => ({ id: r.event.id, title: r.event.title, city: r.event.city, visits: r.count })),
    opportunities: thin
      .filter((p) => p.total > 0)
      .map((p) => ({ city: p.city, label: p.label, path: p.path, total: p.total, needed: MIN_INDEX - p.total }))
      .sort((a, b) => a.needed - b.needed || b.total - a.total),
  }
}
