import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { CITIES } from '@/lib/cities'
import { isComboKind } from '@/lib/local-seo'
import { TOPICS, MIN_INDEX, cityPath, cityToday, addDaysKey, type TopicKey } from '@/lib/seo'
import { cityGuideModel, lastRefreshAt, topicTotal } from '@/lib/seo-server'

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
  combos: { city: string; indexable: number; thin: number; stale: number; nearDuplicate: number }[]
  sitemap: { guides: number; suburbs: number; combos: number; events: number; local: number; static: number }
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
  const combos: SeoReport['combos'] = []
  const models = await Promise.all(CITIES.map(async (city) => ({ city, model: await cityGuideModel(city) })))
  for (const { city, model } of models) {
    if (!model.ok) {
      for (const t of TOPICS) {
        const total = await topicTotal(city, t)
        pages.push({ city: city.name, topic: t.key, label: t.label, path: cityPath(city, t.key), total, indexed: total >= MIN_INDEX })
      }
      suburbs.push({ city: city.name, count: 0 })
      combos.push({ city: city.name, indexable: 0, thin: 0, stale: 0, nearDuplicate: 0 })
      continue
    }
    for (const t of TOPICS) {
      const path = cityPath(city, t.key)
      const decision = model.decisions.find((d) => d.path === path)
      pages.push({ city: city.name, topic: t.key, label: t.label, path, total: decision?.total ?? 0, indexed: !!decision?.index })
    }
    const comboRows = model.decisions.filter((d) => isComboKind(d.kind))
    suburbs.push({ city: city.name, count: model.decisions.filter((d) => d.kind === 'suburb' && d.index).length })
    combos.push({
      city: city.name,
      indexable: comboRows.filter((d) => d.index).length,
      thin: comboRows.filter((d) => d.reason === 'thin').length,
      stale: comboRows.filter((d) => d.reason === 'stale').length,
      nearDuplicate: comboRows.filter((d) => d.reason === 'near-duplicate').length,
    })
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
  const comboPages = combos.reduce((s, x) => s + x.indexable, 0)
  const thin = pages.filter((p) => !p.indexed)

  return {
    generatedAt: now.toISOString(),
    lastRefresh: refreshAt?.toISOString() ?? null,
    verification: { google: !!process.env.GOOGLE_SITE_VERIFICATION, bing: !!process.env.BING_SITE_VERIFICATION },
    pages,
    suburbs,
    combos,
    sitemap: { static: 4, guides, suburbs: suburbPages, combos: comboPages, events: Math.min(upcomingCount, 20000), local: localLive },
    technical: [
      { label: 'Thin guide pages (noindexed)', count: thin.length, note: `Fewer than ${MIN_INDEX} live listings: kept out of the sitemap and guide links, served with noindex,follow.` },
      { label: 'Thin local combinations (noindexed)', count: combos.reduce((s, x) => s + x.thin, 0), note: `City, suburb, activity and date pages under ${MIN_INDEX} live listings. They can be opened, but they are noindex and omitted from the sitemap.` },
      { label: 'Stale suburb × activity pages (noindexed)', count: combos.reduce((s, x) => s + x.stale, 0), note: 'Enough listings exist, but fewer than 2 fall in the next 28 days, so the page is kept out of the index.' },
      { label: 'Near-duplicate combinations (redirected)', count: combos.reduce((s, x) => s + x.nearDuplicate, 0), note: 'These URLs repeat at least 85% of a broader guide. Visitors are redirected there and the URL is left out of the sitemap.' },
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
