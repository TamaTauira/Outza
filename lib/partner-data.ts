import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { sourceLabel } from '@/lib/quality'
import { eachDay, parseReachRange, SURFACE_LABELS, type Surface } from '@/lib/organiser-reach'
import { eventPath } from '@/lib/seo'
import { siteUrl } from '@/lib/site-url'
import {
  PARTNER_CSV_HEADER,
  PARTNER_PAGE_SIZE,
  SEARCH_TERM_MIN,
  ctrLabel,
  listingBadges,
  partnerCsv,
  partnerListWhere,
  partnerOrderBy,
  partnerScopeWhere,
  priceLabel,
  type PartnerFilters,
  type PartnerSourceScope,
} from '@/lib/partner-scope'

export const PARTNER_HISTORY_NOTE = 'Page views, saves, shares and Get tickets clicks in a date range come from the daily totals already stored. Itinerary adds in a range, More info clicks, board, map, search and Local appearances, search terms and viewer areas are counted from the current tracking launch and are not backfilled. All-time totals sit beside the range. A zero means nothing was stored for that day. Nothing here is estimated, and no person’s name or email is included.'

const EVENT_SELECT = {
  id: true, title: true, date: true, endDate: true, city: true, suburb: true, category: true, venueName: true,
  status: true, statusSource: true, hidden: true, moderationStatus: true, approvalState: true, deletedAt: true, duplicateOfId: true,
  isFree: true, price: true, priceMin: true, priceMax: true, promoterId: true,
  views: true, ticketClicks: true, itineraryAdds: true, source: true, sourceUrl: true, ticketUrl: true,
  _count: { select: { savedBy: true } },
} satisfies Prisma.EventSelect

type EventHit = Prisma.EventGetPayload<{ select: typeof EVENT_SELECT }>

export type PartnerEventRow = {
  id: string
  title: string
  date: string
  endDate: string | null
  city: string
  suburb: string | null
  category: string
  venueName: string
  badges: { key: string; label: string }[]
  price: string
  claimed: boolean
  views: number
  saves: number
  itineraryAdds: number
  ticketClicks: number
  ctr: string | null
  source: string
  sourceLabel: string
  path: string
  sourceUrl: string | null
}

export type PartnerList = {
  total: number
  page: number
  pages: number
  rows: PartnerEventRow[]
  cities: string[]
  categories: string[]
}

export type PartnerStat = { label: string; events: number; views: number; tickets: number }

export type PartnerOverview = {
  displayName: string
  sources: { key: string; label: string; hosts: string[] }[]
  total: number
  onBoard: number
  past: number
  hidden: number
  inReview: number
  removed: number
  duplicates: number
  cancelled: number
  priceTba: number
  missingImage: number
  missingTicket: number
  claimed: number
  openReports: number
  allTime: { views: number; saves: number; itinerary: number; tickets: number; shares: number; ctr: string | null }
  range: { from: string; to: string; views: number; saves: number; tickets: number; shares: number; itinerary: number; info: number; calendar: number; plans: number; ctr: string | null }
  series: { day: string; views: number; tickets: number }[]
  surfaces: { label: string; count: number }[]
  terms: { term: string; count: number }[]
  places: { label: string; count: number }[]
  referrals: { source: string; count: number }[]
  cities: PartnerStat[]
  categories: PartnerStat[]
  suburbs: PartnerStat[]
  topClicks: PartnerEventRow[]
  topViews: PartnerEventRow[]
  historyNote: string
}

const REFERRAL_LABEL: Record<string, string> = {
  OUTZA: 'Opened on VibePeep',
  SEARCH: 'Search',
  SOCIAL: 'Social',
  EMAIL: 'Email',
  DIRECT: 'Direct',
  OTHER: 'Other',
}

function toRow(event: EventHit, now = new Date()): PartnerEventRow {
  return {
    id: event.id,
    title: event.title,
    date: event.date.toISOString(),
    endDate: event.endDate ? event.endDate.toISOString() : null,
    city: event.city,
    suburb: event.suburb,
    category: event.category,
    venueName: event.venueName,
    badges: listingBadges(event, now),
    price: priceLabel(event),
    claimed: !!event.promoterId,
    views: event.views,
    saves: event._count.savedBy,
    itineraryAdds: event.itineraryAdds,
    ticketClicks: event.ticketClicks,
    ctr: ctrLabel(event.ticketClicks, event.views),
    source: event.source,
    sourceLabel: sourceLabel(event.source),
    path: eventPath(event),
    sourceUrl: event.sourceUrl || event.ticketUrl || null,
  }
}

function scopeSql(scope: PartnerSourceScope[]): Prisma.Sql {
  const keys = [...new Set(scope.map((row) => row.sourceKey).filter(Boolean))]
  const hosts = [...new Set(scope.flatMap((row) => row.hostPatterns))]
  const parts: Prisma.Sql[] = []
  if (keys.length) {
    parts.push(Prisma.sql`e."source" IN (${Prisma.join(keys)})`)
    parts.push(Prisma.sql`e."sources" && ARRAY[${Prisma.join(keys)}]::text[]`)
    parts.push(Prisma.sql`EXISTS (SELECT 1 FROM "SourceRecord" sr WHERE sr."eventId" = e.id AND sr."source" IN (${Prisma.join(keys)}))`)
  }
  for (const host of hosts) {
    const plain = `%://${host}%`
    const www = `%://www.${host}%`
    const dotted = `%.${host}%`
    parts.push(Prisma.sql`(e."ticketUrl" ILIKE ${plain} OR e."ticketUrl" ILIKE ${www} OR e."ticketUrl" ILIKE ${dotted} OR e."sourceUrl" ILIKE ${plain} OR e."sourceUrl" ILIKE ${www} OR e."sourceUrl" ILIKE ${dotted})`)
    parts.push(Prisma.sql`EXISTS (SELECT 1 FROM "SourceRecord" sr WHERE sr."eventId" = e.id AND (COALESCE(sr."canonicalUrl", '') ILIKE ${`%${host}%`} OR COALESCE(sr."sourceUrl", '') ILIKE ${`%${host}%`}))`)
  }
  if (!parts.length) return Prisma.sql`FALSE`
  return Prisma.sql`(${Prisma.join(parts, ' OR ')})`
}

async function countWhere(where: Prisma.EventWhereInput): Promise<number> {
  return prisma.event.count({ where })
}

function statRows(rows: { key: string | null; events: number; views: number | null; tickets: number | null }[]): PartnerStat[] {
  return rows
    .filter((row) => row.key && row.key.trim())
    .map((row) => ({ label: row.key!.trim(), events: row.events, views: row.views ?? 0, tickets: row.tickets ?? 0 }))
    .sort((a, b) => b.events - a.events || b.views - a.views)
}

export async function loadPartnerEvents(scope: PartnerSourceScope[], filters: PartnerFilters, now = new Date()): Promise<PartnerList> {
  const where = partnerListWhere(scope, filters, now)
  const scopeWhere = partnerScopeWhere(scope)
  const page = filters.page
  const [rows, total, cities, categories] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: [partnerOrderBy(filters.sort, filters.dir), { id: 'asc' }],
      skip: (page - 1) * PARTNER_PAGE_SIZE,
      take: PARTNER_PAGE_SIZE,
      select: EVENT_SELECT,
    }),
    prisma.event.count({ where }),
    prisma.event.groupBy({ by: ['city'], where: scopeWhere, _count: { _all: true } }),
    prisma.event.groupBy({ by: ['category'], where: scopeWhere, _count: { _all: true } }),
  ])
  const pages = Math.max(1, Math.ceil(total / PARTNER_PAGE_SIZE))
  return {
    total,
    page: Math.min(page, pages),
    pages,
    rows: rows.map((row) => toRow(row, now)),
    cities: cities.map((row) => row.city).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    categories: categories.map((row) => row.category).filter(Boolean).sort((a, b) => a.localeCompare(b)),
  }
}

export async function loadPartnerCsv(scope: PartnerSourceScope[], filters: PartnerFilters, now = new Date()): Promise<string> {
  const where = partnerListWhere(scope, filters, now)
  const origin = siteUrl()
  const header = PARTNER_CSV_HEADER
  const lines: (string | number | null)[][] = []
  const batch = 400
  for (let skip = 0; skip < 60000; skip += batch) {
    const rows = await prisma.event.findMany({
      where,
      orderBy: [partnerOrderBy(filters.sort, filters.dir), { id: 'asc' }],
      skip,
      take: batch,
      select: EVENT_SELECT,
    })
    for (const event of rows) {
      const row = toRow(event, now)
      lines.push([
        row.title,
        row.date.slice(0, 10),
        row.endDate ? row.endDate.slice(0, 10) : '',
        row.city,
        row.suburb,
        row.category,
        row.venueName,
        row.badges[0]?.label ?? '',
        row.badges.slice(1).map((badge) => badge.label).join('; '),
        row.price,
        row.claimed ? 'Yes' : 'No',
        row.views,
        row.saves,
        row.itineraryAdds,
        row.ticketClicks,
        row.ctr,
        row.source,
        `${origin}${row.path}`,
        event.sourceUrl,
        event.ticketUrl,
        row.id,
      ])
    }
    if (rows.length < batch) break
  }
  return partnerCsv(header, lines)
}

export async function loadPartnerOverview(input: {
  displayName: string
  scope: PartnerSourceScope[]
  engagement: PartnerFilters['engagement']
  now?: Date
}): Promise<PartnerOverview> {
  const now = input.now ?? new Date()
  const scopeWhere = partnerScopeWhere(input.scope)
  const range = parseReachRange({ range: input.engagement }, now)
  const board = partnerListWhere(input.scope, { ...emptyFilters(), status: 'board' }, now)
  const past = partnerListWhere(input.scope, { ...emptyFilters(), status: 'past' }, now)
  const hidden = partnerListWhere(input.scope, { ...emptyFilters(), status: 'hidden' }, now)
  const review = partnerListWhere(input.scope, { ...emptyFilters(), status: 'review' }, now)
  const removed = partnerListWhere(input.scope, { ...emptyFilters(), status: 'removed' }, now)
  const duplicate = partnerListWhere(input.scope, { ...emptyFilters(), status: 'duplicate' }, now)
  const cancelled = partnerListWhere(input.scope, { ...emptyFilters(), status: 'cancelled' }, now)
  const tba = partnerListWhere(input.scope, { ...emptyFilters(), price: 'tba' }, now)

  const [
    total, onBoard, pastCount, hiddenCount, inReview, removedCount, duplicates, cancelledCount, priceTba,
    missingImage, missingTicket, claimed, openReports, sums, saves, engagement, seriesRows, referrals,
    cityRows, categoryRows, suburbRows, topClicks, topViews, metricRows,
  ] = await Promise.all([
    countWhere(scopeWhere),
    countWhere(board),
    countWhere(past),
    countWhere(hidden),
    countWhere(review),
    countWhere(removed),
    countWhere(duplicate),
    countWhere(cancelled),
    countWhere(tba),
    countWhere({ AND: [scopeWhere, { OR: [{ imageUrl: null }, { imageUrl: '' }] }] }),
    countWhere({ AND: [scopeWhere, { OR: [{ ticketUrl: null }, { ticketUrl: '' }] }] }),
    countWhere({ AND: [scopeWhere, { promoterId: { not: null } }] }),
    prisma.eventReport.count({ where: { status: 'OPEN', event: scopeWhere } }),
    prisma.event.aggregate({ where: scopeWhere, _sum: { views: true, ticketClicks: true, itineraryAdds: true, shares: true } }),
    prisma.savedEvent.count({ where: { event: scopeWhere } }),
    prisma.engagementDay.groupBy({
      by: ['kind'],
      where: { day: { gte: range.from, lte: range.to }, event: scopeWhere, kind: { in: ['VIEW', 'SAVE', 'TICKET', 'SHARE'] } },
      _sum: { count: true },
    }),
    prisma.engagementDay.groupBy({
      by: ['day', 'kind'],
      where: { day: { gte: range.from, lte: range.to }, event: scopeWhere, kind: { in: ['VIEW', 'TICKET'] } },
      _sum: { count: true },
    }),
    prisma.eventReferral.groupBy({
      by: ['source'],
      where: { event: scopeWhere },
      _sum: { count: true },
    }),
    prisma.event.groupBy({ by: ['city'], where: scopeWhere, _count: { _all: true }, _sum: { views: true, ticketClicks: true } }),
    prisma.event.groupBy({ by: ['category'], where: scopeWhere, _count: { _all: true }, _sum: { views: true, ticketClicks: true } }),
    prisma.event.groupBy({ by: ['suburb'], where: { AND: [scopeWhere, { suburb: { not: null } }, { NOT: { suburb: '' } }] }, _count: { _all: true }, _sum: { views: true, ticketClicks: true } }),
    prisma.event.findMany({ where: scopeWhere, orderBy: [{ ticketClicks: 'desc' }, { views: 'desc' }], take: 8, select: EVENT_SELECT }),
    prisma.event.findMany({ where: scopeWhere, orderBy: [{ views: 'desc' }, { ticketClicks: 'desc' }], take: 8, select: EVENT_SELECT }),
    input.scope.length
      ? prisma.$queryRaw<{ name: string; dim: string; n: number }[]>`
          SELECT pm.name, pm.dim, SUM(pm.count)::int AS n
          FROM "ProductMetric" pm
          WHERE pm."subjectKind" = 'event'
            AND pm.day >= ${range.from}
            AND pm.day <= ${range.to}
            AND pm.name IN ('seen', 'search', 'itinerary', 'info', 'place', 'calendar', 'plan')
            AND EXISTS (SELECT 1 FROM "Event" e WHERE e.id = pm."subjectId" AND ${scopeSql(input.scope)})
          GROUP BY pm.name, pm.dim
        `
      : Promise.resolve([]),
  ])

  const kindSum = (kind: string) => engagement.find((row) => row.kind === kind)?._sum.count ?? 0
  const views = sums._sum.views ?? 0
  const tickets = sums._sum.ticketClicks ?? 0
  const rangeViews = kindSum('VIEW')
  const rangeTickets = kindSum('TICKET')
  const byDay = new Map<string, { views: number; tickets: number }>()
  for (const day of eachDay(range.from, range.to)) byDay.set(day, { views: 0, tickets: 0 })
  for (const row of seriesRows) {
    const bucket = byDay.get(row.day) ?? { views: 0, tickets: 0 }
    if (row.kind === 'VIEW') bucket.views += row._sum.count ?? 0
    if (row.kind === 'TICKET') bucket.tickets += row._sum.count ?? 0
    byDay.set(row.day, bucket)
  }
  const metric = (name: string, dim = '') => metricRows.filter((row) => row.name === name && (dim ? row.dim === dim : true)).reduce((sum, row) => sum + Number(row.n), 0)

  return {
    displayName: input.displayName,
    sources: input.scope.map((row) => ({ key: row.sourceKey, label: sourceLabel(row.sourceKey), hosts: row.hostPatterns })),
    total,
    onBoard,
    past: pastCount,
    hidden: hiddenCount,
    inReview,
    removed: removedCount,
    duplicates,
    cancelled: cancelledCount,
    priceTba,
    missingImage,
    missingTicket,
    claimed,
    openReports,
    allTime: {
      views,
      saves,
      itinerary: sums._sum.itineraryAdds ?? 0,
      tickets,
      shares: sums._sum.shares ?? 0,
      ctr: ctrLabel(tickets, views),
    },
    range: {
      from: range.from,
      to: range.to,
      views: rangeViews,
      saves: kindSum('SAVE'),
      tickets: rangeTickets,
      shares: kindSum('SHARE'),
      itinerary: metric('itinerary'),
      info: metric('info'),
      calendar: metric('calendar'),
      plans: metric('plan'),
      ctr: ctrLabel(rangeTickets, rangeViews),
    },
    series: [...byDay.entries()].map(([day, bucket]) => ({ day, ...bucket })),
    surfaces: (['board', 'hot', 'search', 'map', 'local', 'spotlight'] as Surface[])
      .map((surface) => ({ label: SURFACE_LABELS[surface], count: metricRows.filter((row) => row.name === 'seen' && row.dim === surface).reduce((sum, row) => sum + Number(row.n), 0) }))
      .filter((row) => row.count > 0),
    terms: metricRows
      .filter((row) => row.name === 'search' && row.dim && Number(row.n) >= SEARCH_TERM_MIN)
      .map((row) => ({ term: row.dim, count: Number(row.n) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    places: metricRows
      .filter((row) => row.name === 'place' && Number(row.n) >= 10)
      .map((row) => ({ label: row.dim.replace(/^(city|area):/, ''), count: Number(row.n) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    referrals: referrals
      .map((row) => ({ source: REFERRAL_LABEL[row.source] ?? row.source, count: row._sum.count ?? 0 }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count),
    cities: statRows(cityRows.map((row) => ({ key: row.city, events: row._count._all, views: row._sum.views, tickets: row._sum.ticketClicks }))).slice(0, 12),
    categories: statRows(categoryRows.map((row) => ({ key: row.category, events: row._count._all, views: row._sum.views, tickets: row._sum.ticketClicks }))).slice(0, 12),
    suburbs: statRows(suburbRows.map((row) => ({ key: row.suburb, events: row._count._all, views: row._sum.views, tickets: row._sum.ticketClicks }))).slice(0, 12),
    topClicks: topClicks.map((row) => toRow(row, now)),
    topViews: topViews.map((row) => toRow(row, now)),
    historyNote: PARTNER_HISTORY_NOTE,
  }
}

function emptyFilters(): PartnerFilters {
  return {
    q: '', city: '', category: '', status: 'any', price: 'any', claimed: 'any',
    from: '', to: '', sort: 'date', dir: 'desc', page: 1, engagement: '28',
  }
}

export async function listPartnerAccounts() {
  const rows = await prisma.partnerAccount.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { email: true, name: true, role: true } },
      sources: { orderBy: { sourceKey: 'asc' } },
    },
  })
  return rows.map((row) => ({
    id: row.id,
    email: row.user.email,
    name: row.user.name,
    displayName: row.displayName,
    role: row.user.role,
    sources: row.sources.map((source) => ({ sourceKey: source.sourceKey, hostPatterns: source.hostPatterns })),
    createdAt: row.createdAt.toISOString(),
  }))
}
