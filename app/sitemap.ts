import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'
import { CITIES, cityDef } from '@/lib/cities'
import { TOPICS, MIN_INDEX, cityPath, suburbPath, eventPath, cityToday, addDaysKey } from '@/lib/seo'
import { citySuburbs, requestOrigin, topicTotal } from '@/lib/seo-server'
import { addDaysStr, localPath, occurrences, todayIn, MAX_AHEAD_DAYS } from '@/lib/local-shared'

export const dynamic = 'force-dynamic'

/**
 * Indexable pages only: city guides with enough listings (MIN_INDEX), suburb pages, live OUTZA Local
 * listings and upcoming, non-duplicate, non-cancelled events. Thin guides are noindexed and left out.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await requestOrigin()
  const now = new Date()
  const out: MetadataRoute.Sitemap = [
    { url: `${origin}/`, lastModified: now, changeFrequency: 'hourly', priority: 1 },
    { url: `${origin}/promoters`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${origin}/local`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${origin}/how-listings-work`, changeFrequency: 'monthly', priority: 0.3 },
  ]
  for (const city of CITIES) {
    for (const t of TOPICS) {
      if ((await topicTotal(city, t)) < MIN_INDEX) continue
      out.push({ url: `${origin}${cityPath(city, t.key)}`, lastModified: now, changeFrequency: 'daily', priority: t.key === 'events' ? 0.9 : 0.8 })
    }
    for (const s of await citySuburbs(city)) out.push({ url: `${origin}${suburbPath(city, s.name)}`, lastModified: now, changeFrequency: 'daily', priority: 0.6 })
  }

  const locals = await prisma.localListing.findMany({
    where: { status: 'APPROVED', expiresAt: { gte: now }, duplicateOfId: null },
    select: { id: true, title: true, city: true, updatedAt: true, startDate: true, endDate: true, startTime: true, endTime: true, recurrence: true, recurUntil: true },
    take: 5000,
  }).catch(() => [])
  for (const l of locals) {
    const today = todayIn(cityDef(l.city).tz)
    if (!occurrences(l, today, addDaysStr(today, MAX_AHEAD_DAYS)).length) continue
    out.push({ url: `${origin}${localPath(l)}`, lastModified: l.updatedAt, changeFrequency: 'weekly', priority: 0.6 })
  }

  const earliest = CITIES.map((c) => cityToday(c)).sort()[0]
  const events = await prisma.event.findMany({
    where: {
      duplicateOfId: null,
      status: { not: 'CANCELLED' },
      OR: [{ date: { gte: new Date(`${earliest}T00:00:00Z`) } }, { endDate: { gte: new Date(`${earliest}T00:00:00Z`) } }],
      date: { lte: new Date(`${addDaysKey(earliest, 365)}T00:00:00Z`) },
    },
    select: { id: true, title: true, updatedAt: true, lastVerifiedAt: true },
    orderBy: { date: 'asc' },
    take: 20000,
  })
  for (const e of events) out.push({ url: `${origin}${eventPath(e)}`, lastModified: e.lastVerifiedAt ?? e.updatedAt, changeFrequency: 'daily', priority: 0.7 })
  return out
}
