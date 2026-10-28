import { prisma } from '@/lib/prisma'
import { CITIES, cityDef } from '@/lib/cities'
import { TOPICS, MIN_INDEX, addDaysKey, cityPath, cityToday, eventPath, isLandingSuburb, suburbPath } from '@/lib/seo'
import { siteUrl } from '@/lib/site-url'
import { addDaysStr, localPath, occurrences, todayIn, MAX_AHEAD_DAYS } from '@/lib/local-shared'

const PAGE = 2000
const memory = new Map<string, { at: number; body: string }>()
const TTL = 60 * 60 * 1000

export function xmlHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  }
}

function cached(key: string, build: () => Promise<string>): Promise<string> {
  const hit = memory.get(key)
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.body)
  return build().then((body) => {
    memory.set(key, { at: Date.now(), body })
    return body
  })
}

const day = (key: string) => new Date(`${key}T00:00:00.000Z`)

function eventWhere() {
  const earliest = CITIES.map((c) => cityToday(c)).sort()[0]
  return {
    duplicateOfId: null,
    status: { not: 'CANCELLED' as const },
    OR: [{ date: { gte: day(earliest) } }, { endDate: { gte: day(earliest) } }],
    date: { lte: day(addDaysKey(earliest, 365)) },
  }
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function urlset(urls: { loc: string; lastmod?: Date | null }[]) {
  const body = urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.toISOString()}</lastmod>` : ''}</url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

export async function eventSitemapPages(): Promise<number> {
  const n = await prisma.event.count({ where: eventWhere() }).catch(() => 0)
  return Math.max(0, Math.ceil(n / PAGE))
}

export function sitemapIndexXml() {
  return cached('index', async () => {
    const origin = siteUrl()
    const pages = await eventSitemapPages()
    const locs = [`${origin}/sitemaps/guides.xml`, ...Array.from({ length: pages }, (_, i) => `${origin}/sitemaps/events/${i + 1}.xml`)]
    const body = locs.map((loc) => `  <sitemap><loc>${esc(loc)}</loc></sitemap>`).join('\n')
    return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`
  })
}

export function guidesSitemapXml() {
  return cached('guides', async () => {
    const origin = siteUrl()
    const now = new Date()
    const where = eventWhere()
    const urls: { loc: string; lastmod?: Date | null }[] = [
      { loc: `${origin}/`, lastmod: now },
      { loc: `${origin}/promoters` },
      { loc: `${origin}/local`, lastmod: now },
      { loc: `${origin}/how-listings-work` },
    ]
    const [byCity, suburbs, locals] = await Promise.all([
      prisma.event.groupBy({ by: ['city'], where, _count: { _all: true } }).catch(() => []),
      prisma.event.groupBy({
        by: ['city', 'suburb'],
        where: { ...where, suburb: { not: null } },
        _count: { _all: true },
      }).catch(() => []),
      prisma.localListing.findMany({
        where: { status: 'APPROVED', expiresAt: { gte: now }, duplicateOfId: null },
        select: { id: true, title: true, city: true, updatedAt: true, startDate: true, endDate: true, startTime: true, endTime: true, recurrence: true, recurUntil: true },
        take: 2000,
      }).catch(() => []),
    ])
    const live = new Set(byCity.filter((r) => r._count._all >= MIN_INDEX).map((r) => r.city))
    for (const city of CITIES) {
      if (!live.has(city.name)) continue
      for (const t of TOPICS) urls.push({ loc: `${origin}${cityPath(city, t.key)}`, lastmod: now })
    }
    for (const row of suburbs) {
      if (!row.suburb || row._count._all < 3) continue
      const city = CITIES.find((c) => c.name === row.city)
      if (!city || !isLandingSuburb(row.suburb, city)) continue
      urls.push({ loc: `${origin}${suburbPath(city, row.suburb)}`, lastmod: now })
    }
    for (const l of locals) {
      const today = todayIn(cityDef(l.city).tz)
      if (!occurrences(l, today, addDaysStr(today, MAX_AHEAD_DAYS)).length) continue
      urls.push({ loc: `${origin}${localPath(l)}`, lastmod: l.updatedAt })
    }
    return urlset(urls)
  })
}

export function eventsSitemapXml(page: number) {
  const safe = Math.max(1, page)
  return cached(`events-${safe}`, async () => {
    const origin = siteUrl()
    const events = await prisma.event.findMany({
      where: eventWhere(),
      select: { id: true, title: true, updatedAt: true, lastVerifiedAt: true },
      orderBy: { id: 'asc' },
      skip: (safe - 1) * PAGE,
      take: PAGE,
    }).catch(() => [])
    return urlset(events.map((e) => ({ loc: `${origin}${eventPath(e)}`, lastmod: e.lastVerifiedAt ?? e.updatedAt })))
  })
}
