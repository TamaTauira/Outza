import { prisma } from '@/lib/db'
import { missingRelation, heatForEvents } from '@/lib/engagement-store'
import { eventPath } from '@/lib/seo'
import { siteUrl } from '@/lib/site-url'
import { productName } from '@/lib/tiers'
import { includeInAudience } from '@/lib/profile-shared'
import { isQaAccountEmail } from '@/lib/qa-account'
import { CATEGORIES } from '@/lib/categories'
import {
  HISTORY_NOTE,
  MIN_COHORT,
  MIN_PEERS,
  REACTION_LABELS,
  SURFACE_LABELS,
  audienceShares,
  benchmarkSentence,
  bestTimeLine,
  clickRate,
  costPerClick,
  eachDay,
  funnel,
  impressionSydneyDay,
  isSurface,
  parseReachRange,
  peakHour,
  peakWeekday,
  reachTips,
  suppressSmall,
  sydneyInstant,
  toCsv,
  type Surface,
} from '@/lib/organiser-reach'

const MUSIC = new Set(CATEGORIES.find((category) => category.name === 'Music')?.subTags ?? [])

type EventRow = {
  id: string
  title: string
  date: Date
  city: string
  suburb: string | null
  category: string
  venueName: string
  imageUrl: string | null
  views: number
  ticketClicks: number
  shares: number
  itineraryAdds: number
  promoterId: string | null
}

export type ReachPayload = {
  range: { from: string; to: string }
  showPrivate: boolean
  includeSpend: boolean
  lockNote: string | null
  historyNote: string
  totals: {
    seen: number | null
    opened: number | null
    saves: number
    going: number
    reactions: number
    ticket: number | null
    info: number | null
    shares: number
    plans: number
    itinerary: number
    calendar: number | null
    shareVisits: number | null
  }
  allTime: { views: number | null; ticketClicks: number | null; saves: number; shares: number; itinerary: number; reactions: number }
  reactions: { kind: string; label: string; count: number }[]
  series: { day: string; seen: number; opened: number; saves: number; ticket: number }[]
  funnel: { label: string; value: number | null; share: number | null; step: number | null }[]
  surfaces: { label: string; count: number }[]
  places: { label: string; count: number }[]
  terms: { term: string; count: number }[]
  hours: { hour: number; label: string; count: number }[]
  peakLine: string | null
  audience: { label: string; pct: number }[]
  styles: { label: string; pct: number }[]
  comparison: { id: string; title: string; seen: number | null; opened: number | null; ticket: number | null; info: number | null; saves: number; reactions: number }[]
  campaigns: { id: string; name: string; eventTitle: string; impressions: number; clicks: number; ticketClicks: number; ctr: number | null; spendCents: number | null; cpcCents: number | null }[]
  campaignNote: string | null
  radar: { title: string; when: string; where: string; category: string; attention: string; href: string }[]
  radarNote: string
  benchmark: string | null
  tips: string[]
  shareLinks: { id: string; code: string; label: string; channel: string; url: string; visits: number | null; eventTitle: string }[]
  events: { id: string; title: string }[]
}

const emptyPayload = (range: { from: string; to: string }, includeSpend: boolean): ReachPayload => ({
  range,
  showPrivate: false,
  includeSpend,
  lockNote: null,
  historyNote: HISTORY_NOTE,
  totals: { seen: null, opened: null, saves: 0, going: 0, reactions: 0, ticket: null, info: null, shares: 0, plans: 0, itinerary: 0, calendar: null, shareVisits: null },
  allTime: { views: null, ticketClicks: null, saves: 0, shares: 0, itinerary: 0, reactions: 0 },
  reactions: [],
  series: [],
  funnel: funnel([
    { label: 'Seen', value: null },
    { label: 'Opened', value: null },
    { label: 'Saved', value: 0 },
    { label: 'Get tickets', value: null },
  ]),
  surfaces: [],
  places: [],
  terms: [],
  hours: [],
  peakLine: null,
  audience: [],
  styles: [],
  comparison: [],
  campaigns: [],
  campaignNote: null,
  radar: [],
  radarNote: 'Other listings on the same night, in the same patch. Titles are public. Their numbers are not.',
  benchmark: null,
  tips: ['Nothing on your dashboard yet. Claim a listing or create one, then the room has something to react to.'],
  shareLinks: [],
  events: [],
})

async function safe<T>(label: string, fallback: NoInfer<T>, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if (!missingRelation(err)) console.error(label, (err as Error)?.message)
    return fallback
  }
}

function placeLabel(dim: string): string | null {
  if (dim.startsWith('city:')) return dim.slice(5)
  if (dim.startsWith('area:')) return dim.slice(5)
  return null
}

export async function loadReach(input: {
  events: EventRow[]
  privateIds: Set<string>
  showPrivate: boolean
  includeSpend: boolean
  lockNote: string | null
  range: { from: string; to: string }
  promoterId: string | null
  excludePeerIds: string[]
  focus: EventRow | null
}): Promise<ReachPayload> {
  const { events, range } = input
  if (!events.length) return emptyPayload(range, input.includeSpend)
  const ids = events.map((event) => event.id)
  const start = sydneyInstant(range.from)
  const end = sydneyInstant(range.to, true)
  const privateIds = input.privateIds

  const [engagement, metrics, reactionRows, reactionTotals, saves, plans, itinerary, signals] = await Promise.all([
    safe('engagement', [], () => prisma.engagementDay.findMany({
      where: { eventId: { in: ids }, day: { gte: range.from, lte: range.to } },
      select: { eventId: true, day: true, kind: true, count: true },
    })),
    safe('metrics', [], () => prisma.productMetric.findMany({
      where: { subjectKind: 'event', subjectId: { in: ids }, day: { gte: range.from, lte: range.to } },
      select: { subjectId: true, day: true, name: true, dim: true, count: true },
    })),
    safe('reaction kinds', [], () => prisma.eventReaction.groupBy({
      by: ['kind'],
      where: { eventId: { in: ids }, kind: { not: 'GOING' }, updatedAt: { gte: start, lte: end } },
      _count: { _all: true },
    })),
    safe('reaction events', [], () => prisma.eventReaction.groupBy({
      by: ['eventId'],
      where: { eventId: { in: ids }, kind: { not: 'GOING' }, updatedAt: { gte: start, lte: end } },
      _count: { _all: true },
    })),
    safe('saves', [], () => prisma.savedEvent.groupBy({
      by: ['eventId'],
      where: { eventId: { in: ids } },
      _count: { _all: true },
    })),
    safe('plans', [], () => prisma.togetherItem.groupBy({
      by: ['eventId'],
      where: { eventId: { in: ids }, createdAt: { gte: start, lte: end } },
      _count: { _all: true },
    })),
    safe('itinerary', [], () => prisma.eventSignal.groupBy({
      by: ['eventId'],
      where: { eventId: { in: ids }, kind: 'ITINERARY', createdAt: { gte: start, lte: end } },
      _count: { _all: true },
    })),
    safe('signals', [], () => prisma.eventSignal.findMany({
      where: { eventId: { in: ids } },
      select: { userId: true },
      distinct: ['userId'],
      take: 800,
    })),
  ])

  const seriesMap = new Map(eachDay(range.from, range.to).map((day) => [day, { day, seen: 0, opened: 0, saves: 0, ticket: 0 }]))
  const per = new Map(ids.map((id) => [id, { seen: 0, opened: 0, saves: 0, going: 0, ticket: 0, info: 0, shares: 0, reactions: 0, calendar: 0, plans: 0, itinerary: 0 }]))
  const surfaces = new Map<string, number>()
  const places = new Map<string, number>()
  const terms = new Map<string, number>()
  const hours = new Map<number, number>()

  for (const row of engagement) {
    const bucket = per.get(row.eventId)
    const point = seriesMap.get(row.day)
    const priv = privateIds.has(row.eventId)
    if (row.kind === 'VIEW' && priv) {
      if (bucket) bucket.opened += row.count
      if (point && input.showPrivate) point.opened += row.count
    } else if (row.kind === 'TICKET' && priv) {
      if (bucket) bucket.ticket += row.count
      if (point && input.showPrivate) point.ticket += row.count
    } else if (row.kind === 'SAVE') {
      if (bucket) bucket.saves += row.count
      if (point) point.saves += row.count
    } else if (row.kind === 'SHARE' && bucket) bucket.shares += row.count
    else if (row.kind === 'GOING' && bucket) bucket.going += row.count
  }
  for (const row of metrics) {
    const bucket = per.get(row.subjectId)
    const priv = privateIds.has(row.subjectId)
    if (!priv || !input.showPrivate) continue
    if (row.name === 'seen') {
      if (bucket) bucket.seen += row.count
      const point = seriesMap.get(row.day)
      if (point) point.seen += row.count
      if (isSurface(row.dim)) surfaces.set(row.dim, (surfaces.get(row.dim) ?? 0) + row.count)
    } else if (row.name === 'info' && bucket) bucket.info += row.count
    else if (row.name === 'calendar' && bucket) bucket.calendar += row.count
    else if (row.name === 'place') {
      const label = placeLabel(row.dim)
      if (label) places.set(label, (places.get(label) ?? 0) + row.count)
    } else if (row.name === 'search' && row.dim) terms.set(row.dim, (terms.get(row.dim) ?? 0) + row.count)
    else if (row.name === 'hour') {
      const hour = Number(row.dim)
      if (hour >= 0 && hour <= 23) hours.set(hour, (hours.get(hour) ?? 0) + row.count)
    }
  }
  for (const row of reactionTotals) {
    const bucket = per.get(row.eventId)
    if (bucket) bucket.reactions = row._count._all
  }
  for (const row of plans) {
    if (!row.eventId) continue
    const bucket = per.get(row.eventId)
    if (bucket) bucket.plans = row._count._all
  }
  for (const row of itinerary) {
    const bucket = per.get(row.eventId)
    if (bucket) bucket.itinerary = row._count._all
  }

  const sum = (pick: (row: NonNullable<ReturnType<typeof per.get>>) => number) => [...per.values()].reduce((total, row) => total + pick(row), 0)
  const seen = input.showPrivate ? sum((row) => row.seen) : null
  const opened = input.showPrivate ? sum((row) => row.opened) : null
  const ticket = input.showPrivate ? sum((row) => row.ticket) : null
  const info = input.showPrivate ? sum((row) => row.info) : null
  const calendar = input.showPrivate ? sum((row) => row.calendar) : null
  const savesInRange = sum((row) => row.saves)
  const hourRows = [...hours.entries()].map(([hour, count]) => ({ hour, count }))
  const busyHour = input.showPrivate ? peakHour(hourRows) : null
  const busyDay = peakWeekday([...seriesMap.values()].map((point) => ({ day: point.day, count: point.opened || point.saves })))

  const adultIds = await audienceIds(signals.map((row) => row.userId))
  const [audience, styles] = await audienceSnapshot(adultIds)
  const focus = input.focus
  const [benchmark, radar] = focus
    ? await Promise.all([
      input.showPrivate && privateIds.has(focus.id) ? benchmarkFor(focus, input.excludePeerIds, range, per.get(focus.id)?.ticket ?? 0) : Promise.resolve(null),
      radarFor(focus, input.excludePeerIds),
    ])
    : [null, []]

  const campaigns = input.includeSpend && input.promoterId
    ? await loadCampaigns(input.promoterId, events, range, engagement)
    : []
  const shareLinks = input.promoterId ? await loadLinks(input.promoterId, ids, input.showPrivate) : []

  const payload: ReachPayload = {
    range,
    showPrivate: input.showPrivate,
    includeSpend: input.includeSpend,
    lockNote: input.lockNote,
    historyNote: HISTORY_NOTE,
    totals: {
      seen,
      opened,
      saves: savesInRange,
      going: sum((row) => row.going),
      reactions: reactionRows.reduce((total, row) => total + row._count._all, 0),
      ticket,
      info,
      shares: sum((row) => row.shares),
      plans: sum((row) => row.plans),
      itinerary: sum((row) => row.itinerary),
      calendar,
      shareVisits: input.showPrivate ? shareLinks.reduce((total, link) => total + (link.visits ?? 0), 0) : null,
    },
    allTime: {
      views: input.showPrivate ? events.filter((event) => privateIds.has(event.id)).reduce((total, event) => total + event.views, 0) : null,
      ticketClicks: input.showPrivate ? events.filter((event) => privateIds.has(event.id)).reduce((total, event) => total + event.ticketClicks, 0) : null,
      saves: saves.reduce((total, row) => total + row._count._all, 0),
      shares: events.reduce((total, event) => total + event.shares, 0),
      itinerary: events.reduce((total, event) => total + event.itineraryAdds, 0),
      reactions: reactionRows.reduce((total, row) => total + row._count._all, 0),
    },
    reactions: reactionRows.map((row) => ({ kind: row.kind, label: REACTION_LABELS[row.kind] ?? row.kind, count: row._count._all })).sort((a, b) => b.count - a.count),
    series: [...seriesMap.values()],
    funnel: funnel([
      { label: 'Seen', value: seen },
      { label: 'Opened', value: opened },
      { label: 'Saved', value: savesInRange },
      { label: 'Get tickets', value: ticket },
    ]),
    surfaces: [...surfaces.entries()].map(([surface, count]) => ({ label: SURFACE_LABELS[surface as Surface] ?? surface, count })).sort((a, b) => b.count - a.count),
    places: suppressSmall([...places.entries()].map(([label, count]) => ({ label, count }))).slice(0, 8),
    terms: suppressSmall([...terms.entries()].map(([term, count]) => ({ term, count })), 5).slice(0, 8),
    hours: busyHour == null ? [] : hourRows.map((row) => ({ hour: row.hour, label: `${row.hour}`, count: row.count })).sort((a, b) => a.hour - b.hour),
    peakLine: bestTimeLine(busyDay, busyHour),
    audience,
    styles,
    comparison: events.slice(0, 12).map((event) => {
      const bucket = per.get(event.id)
      const open = privateIds.has(event.id) && input.showPrivate
      return {
        id: event.id,
        title: event.title,
        seen: open ? bucket?.seen ?? 0 : null,
        opened: open ? bucket?.opened ?? 0 : null,
        ticket: open ? bucket?.ticket ?? 0 : null,
        info: open ? bucket?.info ?? 0 : null,
        saves: bucket?.saves ?? 0,
        reactions: bucket?.reactions ?? 0,
      }
    }),
    campaigns,
    campaignNote: input.includeSpend
      ? 'Short boosts count serves and clicks stored with the boost. Multi-day packages count Get tickets clicks while the package was live. Package serves start from this launch. None of this is a ticket sale.'
      : null,
    radar,
    radarNote: 'Other public listings on the same night, in the same patch. You can see the title. You cannot see their numbers or who is behind them.',
    benchmark,
    tips: reachTips({
      showPrivate: input.showPrivate,
      hasImage: focus ? !!focus.imageUrl : events.some((event) => !!event.imageUrl),
      opened: opened ?? 0,
      seen: seen ?? 0,
      saves: savesInRange,
      ticket: ticket ?? 0,
      reactions: reactionRows.reduce((total, row) => total + row._count._all, 0),
      peakHour: busyHour,
      peakDay: busyDay,
      clashes: radar.length,
      shareLinks: shareLinks.length,
      venue: !input.includeSpend && !input.promoterId,
    }),
    shareLinks,
    events: events.map((event) => ({ id: event.id, title: event.title })),
  }
  return payload
}

async function audienceIds(userIds: string[]): Promise<string[]> {
  if (!userIds.length) return []
  const users = await safe('audience users', [], () => prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, birthYear: true },
  }))
  return users.filter((user) => includeInAudience(user.birthYear) && !isQaAccountEmail(user.email)).map((user) => user.id)
}

async function audienceSnapshot(userIds: string[]): Promise<[{ label: string; pct: number }[], { label: string; pct: number }[]]> {
  if (userIds.length < MIN_COHORT) return [[], []]
  const ids = userIds.slice(0, 400)
  const [people, saves] = await Promise.all([
    safe('categories', [], () => prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, preferredCategories: true } })),
    safe('styles', [], () => prisma.savedEvent.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, event: { select: { subTags: true } } },
      take: 2000,
    })),
  ])
  const categories = new Map<string, number>()
  for (const person of people) {
    for (const category of new Set(person.preferredCategories)) categories.set(category, (categories.get(category) ?? 0) + 1)
  }
  const styles = new Map<string, Set<string>>()
  for (const save of saves) {
    for (const tag of save.event.subTags) {
      if (!MUSIC.has(tag)) continue
      const set = styles.get(tag) ?? new Set<string>()
      set.add(save.userId)
      styles.set(tag, set)
    }
  }
  return [
    audienceShares([...categories.entries()].map(([label, count]) => ({ label, count }))).map(({ label, pct }) => ({ label, pct })),
    audienceShares([...styles.entries()].map(([label, set]) => ({ label, count: set.size }))).map(({ label, pct }) => ({ label, pct })),
  ]
}

async function benchmarkFor(focus: EventRow, excludeIds: string[], range: { from: string; to: string }, ownRangeClicks: number): Promise<string | null> {
  const base = {
    category: focus.category,
    city: focus.city,
    id: { notIn: excludeIds },
    duplicateOfId: null,
    deletedAt: null,
    OR: [{ views: { gt: 0 } }, { ticketClicks: { gt: 0 } }],
  }
  let place = focus.suburb || focus.city
  let peers = await prisma.event.findMany({
    where: { ...base, ...(focus.suburb ? { suburb: focus.suburb } : {}) },
    select: { id: true, ticketClicks: true },
    take: 200,
  })
  if (peers.length < MIN_PEERS && focus.suburb) {
    peers = await prisma.event.findMany({ where: base, select: { id: true, ticketClicks: true }, take: 200 })
    place = focus.city
  }
  if (peers.length < MIN_PEERS) return null
  const peerIds = peers.map((peer) => peer.id)
  const ranged = await safe('peer tickets', [], () => prisma.engagementDay.groupBy({
    by: ['eventId'],
    where: { eventId: { in: peerIds }, kind: 'TICKET', day: { gte: range.from, lte: range.to } },
    _sum: { count: true },
  }))
  const peerRange = ranged.reduce((total, row) => total + (row._sum.count ?? 0), 0)
  if (ownRangeClicks + peerRange > 0) {
    return benchmarkSentence({ clicks: ownRangeClicks, peerClicks: peerRange, peers: peers.length, category: focus.category, place, basis: 'in this range' })
  }
  const peerAll = peers.reduce((total, peer) => total + peer.ticketClicks, 0)
  return benchmarkSentence({ clicks: focus.ticketClicks, peerClicks: peerAll, peers: peers.length, category: focus.category, place, basis: 'all-time' })
}

async function radarFor(focus: EventRow, excludeIds: string[]) {
  const day = focus.date.toISOString().slice(0, 10)
  const rows = await prisma.event.findMany({
    where: {
      id: { notIn: excludeIds },
      category: focus.category,
      city: focus.city,
      ...(focus.suburb ? { suburb: focus.suburb } : {}),
      date: { gte: new Date(`${day}T00:00:00.000Z`), lte: new Date(`${day}T23:59:59.999Z`) },
      duplicateOfId: null,
      deletedAt: null,
      status: { notIn: ['CANCELLED', 'POSTPONED'] },
    },
    select: { id: true, title: true, date: true, suburb: true, category: true, venueName: true },
    orderBy: { date: 'asc' },
    take: 8,
  })
  const heat = await heatForEvents(rows.map((row) => row.id)).catch(() => new Map<string, number>())
  return rows.map((row) => ({
    title: row.title,
    when: row.date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }),
    where: [row.suburb, row.venueName].filter(Boolean).join(' · '),
    category: row.category,
    attention: (heat.get(row.id) ?? 0) > 0 ? 'Hot right now' : 'On the board',
    href: eventPath(row),
  }))
}

async function loadCampaigns(promoterId: string, events: EventRow[], range: { from: string; to: string }, engagement: { eventId: string; day: string; kind: string; count: number }[]) {
  const ids = events.map((event) => event.id)
  const [campaigns, promotions] = await Promise.all([
    safe('campaigns', [], () => prisma.campaign.findMany({
      where: { promoterId, eventId: { in: ids }, status: { notIn: ['CANCELLED', 'PENDING'] } },
      select: { id: true, eventId: true, amountCents: true, inventory: { select: { name: true } }, event: { select: { title: true } } },
      take: 40,
    })),
    safe('packages', [], () => prisma.promotion.findMany({
      where: { promoterId, eventId: { in: ids }, status: { in: ['ACTIVE', 'EXPIRED'] } },
      select: { id: true, eventId: true, tier: true, amountCents: true, startsAt: true, endsAt: true, createdAt: true, event: { select: { title: true } } },
      take: 40,
    })),
  ])
  const campaignIds = campaigns.map((row) => row.id)
  const [impressions, clicks, spotlightSeen] = await Promise.all([
    campaignIds.length ? safe('impressions', [], () => prisma.impression.findMany({
      where: { campaignId: { in: campaignIds } },
      select: { campaignId: true, bucket: true, count: true },
    })) : Promise.resolve([]),
    campaignIds.length ? safe('conversions', [], () => prisma.conversionEvent.groupBy({
      by: ['campaignId', 'kind'],
      where: { campaignId: { in: campaignIds }, createdAt: { gte: sydneyInstant(range.from), lte: sydneyInstant(range.to, true) }, kind: { in: ['DETAIL', 'TICKET'] } },
      _count: { _all: true },
    })) : Promise.resolve([]),
    safe('package serves', [], () => prisma.productMetric.findMany({
      where: { subjectKind: 'event', subjectId: { in: ids }, name: 'seen', dim: 'spotlight', day: { gte: range.from, lte: range.to } },
      select: { subjectId: true, day: true, count: true },
    })),
  ])
  const shown = new Map<string, number>()
  for (const row of impressions) {
    const day = impressionSydneyDay(row.bucket)
    if (!day || day < range.from || day > range.to) continue
    shown.set(row.campaignId, (shown.get(row.campaignId) ?? 0) + row.count)
  }
  const detail = new Map<string, number>()
  const tickets = new Map<string, number>()
  for (const row of clicks) {
    const map = row.kind === 'TICKET' ? tickets : detail
    map.set(row.campaignId, (map.get(row.campaignId) ?? 0) + row._count._all)
  }
  const boostRows = campaigns.map((row) => {
    const impressionsInRange = shown.get(row.id) ?? 0
    const ticketClicks = tickets.get(row.id) ?? 0
    const clickCount = ticketClicks + (detail.get(row.id) ?? 0)
    return {
      id: row.id,
      name: row.inventory.name,
      eventTitle: row.event.title,
      impressions: impressionsInRange,
      clicks: clickCount,
      ticketClicks,
      ctr: clickRate(clickCount, impressionsInRange),
      spendCents: row.amountCents,
      cpcCents: costPerClick(row.amountCents, clickCount),
    }
  })
  const packageRows = promotions.map((row) => {
    const from = (row.startsAt ?? row.createdAt).toISOString().slice(0, 10)
    const to = (row.endsAt ?? new Date()).toISOString().slice(0, 10)
    const startDay = from > range.from ? from : range.from
    const endDay = to < range.to ? to : range.to
    const ticketClicks = engagement.filter((point) => point.eventId === row.eventId && point.kind === 'TICKET' && point.day >= startDay && point.day <= endDay)
      .reduce((total, point) => total + point.count, 0)
    const impressionsInRange = spotlightSeen.filter((point) => point.subjectId === row.eventId && point.day >= startDay && point.day <= endDay)
      .reduce((total, point) => total + point.count, 0)
    return {
      id: row.id,
      name: productName(row.tier),
      eventTitle: row.event.title,
      impressions: impressionsInRange,
      clicks: ticketClicks,
      ticketClicks,
      ctr: clickRate(ticketClicks, impressionsInRange),
      spendCents: row.amountCents,
      cpcCents: costPerClick(row.amountCents, ticketClicks),
    }
  })
  return [...boostRows, ...packageRows]
}

async function loadLinks(promoterId: string, eventIds: string[], showPrivate: boolean) {
  const links = await safe('links', [], () => prisma.shareLink.findMany({
    where: { promoterId, eventId: { in: eventIds } },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { id: true, code: true, label: true, channel: true, visits: true, event: { select: { title: true } } },
  }))
  const origin = siteUrl()
  return links.map((link) => ({
    id: link.id,
    code: link.code,
    label: link.label,
    channel: link.channel,
    url: `${origin}/s/${link.code}`,
    visits: showPrivate ? link.visits : null,
    eventTitle: link.event.title,
  }))
}

const eventSelect = {
  id: true, title: true, date: true, city: true, suburb: true, category: true, venueName: true, imageUrl: true,
  views: true, ticketClicks: true, shares: true, itineraryAdds: true, promoterId: true,
} as const

export async function loadPromoterReach(userId: string, isAdmin: boolean, query: { range?: string | null; from?: string | null; to?: string | null; eventId?: string | null }): Promise<ReachPayload> {
  const range = parseReachRange(query)
  const [user, owned, campaigns] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { proUntil: true } }),
    prisma.event.findMany({
      where: { promoterId: userId, ...(query.eventId ? { id: query.eventId } : {}) },
      orderBy: { date: 'desc' },
      take: 60,
      select: eventSelect,
    }),
    safe('unlock', [], () => prisma.campaign.findMany({
      where: { promoterId: userId, status: { in: ['ACTIVE', 'EXPIRED', 'PAUSED'] } },
      select: { eventId: true },
    })),
  ])
  if (query.eventId && !owned.length) return emptyPayload(range, true)
  const siblingIds = query.eventId
    ? (await prisma.event.findMany({ where: { promoterId: userId }, select: { id: true }, take: 200 })).map((event) => event.id)
    : owned.map((event) => event.id)
  const promo = await safe('promo unlock', [], () => prisma.promotion.findMany({
    where: { promoterId: userId, eventId: { in: owned.map((event) => event.id) }, status: { in: ['ACTIVE', 'EXPIRED'] } },
    select: { eventId: true },
  }))
  const paid = new Set([...campaigns.map((row) => row.eventId), ...promo.map((row) => row.eventId)])
  const pro = isAdmin || (!!user?.proUntil && user.proUntil > new Date())
  const privateIds = new Set(owned.filter((event) => pro || paid.has(event.id)).map((event) => event.id))
  const showPrivate = query.eventId ? privateIds.has(query.eventId) : privateIds.size > 0
  const lockNote = showPrivate && privateIds.size === owned.length
    ? null
    : 'Views, Get tickets, More info, appearances and Spotlight spend stay locked until that event is promoted or Promoter Pro is on. Reactions, saves and going stay visible.'
  const soonest = owned.filter((event) => event.date.getTime() >= Date.now() - 86400000).sort((a, b) => a.date.getTime() - b.date.getTime())[0]
  const focus = (query.eventId ? owned[0] : soonest ?? owned[0]) ?? null
  return loadReach({
    events: owned,
    privateIds: showPrivate ? privateIds : new Set(),
    showPrivate,
    includeSpend: true,
    lockNote: privateIds.size === owned.length && showPrivate ? null : lockNote,
    range,
    promoterId: userId,
    excludePeerIds: siblingIds,
    focus,
  })
}

export async function loadVenueReach(venueId: string, query: { range?: string | null; from?: string | null; to?: string | null; eventId?: string | null }): Promise<ReachPayload> {
  const range = parseReachRange(query)
  const events = await prisma.event.findMany({
    where: { venueId, duplicateOfId: null, deletedAt: null, ...(query.eventId ? { id: query.eventId } : {}) },
    orderBy: { date: 'desc' },
    take: 80,
    select: eventSelect,
  })
  const soonest = events.filter((event) => event.date.getTime() >= Date.now() - 86400000).sort((a, b) => a.date.getTime() - b.date.getTime())[0]
  const focus = (query.eventId ? events[0] : soonest ?? events[0]) ?? null
  const excludePeerIds = query.eventId
    ? (await prisma.event.findMany({ where: { venueId, duplicateOfId: null }, select: { id: true }, take: 200 })).map((event) => event.id)
    : events.map((event) => event.id)
  return loadReach({
    events,
    privateIds: new Set(events.map((event) => event.id)),
    showPrivate: true,
    includeSpend: false,
    lockNote: null,
    range,
    promoterId: null,
    excludePeerIds,
    focus,
  })
}

export function reachCsv(payload: ReachPayload): string {
  const header = ['event', 'seen', 'opened', 'saves', 'reactions', 'get_tickets', 'more_info']
  if (payload.includeSpend) header.push('spotlight_spend_aud')
  const spendByEvent = new Map<string, number>()
  for (const campaign of payload.campaigns) {
    spendByEvent.set(campaign.eventTitle, (spendByEvent.get(campaign.eventTitle) ?? 0) + (campaign.spendCents ?? 0))
  }
  const cell = (value: number | null) => (value == null ? 'Locked' : value)
  const rows = payload.comparison.map((row) => {
    const line: (string | number | null)[] = [row.title, cell(row.seen), cell(row.opened), row.saves, row.reactions, cell(row.ticket), cell(row.info)]
    if (payload.includeSpend) line.push(((spendByEvent.get(row.title) ?? 0) / 100).toFixed(2))
    return line
  })
  return toCsv(header, rows)
}
