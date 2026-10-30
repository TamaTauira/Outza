import { cache } from 'react'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { CITIES, cityDef, type CityDef } from '@/lib/cities'
import { imageAssetSelect, variantUrl, type VariantManifest } from '@/lib/images/spec'
import { placeholderAbsolute } from '@/lib/placeholders'
import { presentListing } from '@/lib/categories'
import { addDaysKey, addressInOtherState, cityToday, eventPath, isLandingSuburb, isTonightSlot, slugify, tzOffset, weekendRange, TOPICS, type GuideFact, type TopicDef, type TopicKey, type WhenKey } from '@/lib/seo'
import { ACTIVITY_TOPICS, evaluateGuides, matchesCommunity, matchesGarage, matchesMarketTitle, matchesPopup, matchesTopic, matchesWarehouse, suburbDirectory, whenRange, type GuideDecision, type InvRow } from '@/lib/local-seo'
import { addDaysStr, localDupKey, localPath, occurrences, recurrenceLabel, todayIn } from '@/lib/local-shared'
import { listingBucket, minutesNow, orderedWindow } from '@/lib/listing-window'

const day = (key: string) => new Date(`${key}T00:00:00.000Z`)

const landingSelect = {
  id: true, title: true, description: true, date: true, endDate: true, time: true, endTime: true, venueName: true, venueAddress: true, suburb: true,
  category: true, subTags: true, isLGBTI: true, isFree: true, price: true, priceMin: true, priceMax: true, imageUrl: true, ticketUrl: true, status: true,
  latitude: true, longitude: true, organiserName: true, organiserUrl: true, city: true,
  source: true, sources: true, lastVerifiedAt: true, statusSource: true, duplicateOfId: true,
  imageAsset: { select: imageAssetSelect },
} satisfies Prisma.EventSelect

export type LandingEvent = Prisma.EventGetPayload<{ select: typeof landingSelect }>

const normTitle = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const ci = (s: string) => ({ title: { contains: s, mode: 'insensitive' as const } })
const POST_FILTER = new Set<TopicKey>(['markets', 'pop-up-sales', 'warehouse-sales', 'garage-sales', 'community-events', 'live-music'])

/** Title-pattern topics need an in-code filter after the DB query, so their totals come from the filtered rows. */
const TOPIC_FILTER: Partial<Record<TopicKey, (e: { title: string; subTags: string[] }) => boolean>> = {
  markets: (e) => matchesMarketTitle(e.title, e.subTags),
  'pop-up-sales': (e) => matchesPopup(e.title),
  'warehouse-sales': (e) => matchesWarehouse(e.title),
  'garage-sales': (e) => matchesGarage(e.title),
  'community-events': (e) => matchesCommunity(e.title),
}

/** Upcoming, non-duplicate, non-cancelled events for a landing page. */
export async function landingEvents(city: CityDef, opts: { topic?: TopicKey; suburb?: string; when?: WhenKey }, take = 60) {
  const today = cityToday(city)
  let from = today
  let to: string | null = null
  const where: Prisma.EventWhereInput = { city: city.name, duplicateOfId: null, status: { not: 'CANCELLED' } }
  if (opts.when) ({ from, to } = whenRange(city, opts.when))
  switch (opts.topic) {
    case 'tonight': if (!opts.when) to = today; break
    case 'this-weekend': if (!opts.when) ({ from, to } = weekendRange(city)); break
    case 'free-events': where.isFree = true; break
    case 'live-music': where.category = 'Music'; break
    case 'family': where.category = 'Family'; break
    case 'lgbtiq': where.isLGBTI = true; break
    case 'festivals': where.OR = [{ subTags: { has: 'Festival' } }, ci('festival')]; break
    case 'markets':
      where.category = { not: 'Business' }
      where.OR = [{ subTags: { hasSome: ['Markets', 'Market'] } }, ci('market')]
      break
    case 'pop-up-sales': where.OR = [ci('pop-up'), ci('popup'), ci('pop up')]; break
    case 'warehouse-sales': where.OR = [ci('warehouse'), ci('sample sale'), ci('clearance'), ci('stock sale'), ci('factory sale')]; break
    case 'garage-sales': where.OR = [ci('garage sale'), ci('yard sale'), ci('moving sale'), ci('boot sale')]; break
    case 'community-events': where.OR = [ci('fete'), ci('fundraiser'), ci('swap'), ci('boot sale'), ci('school fair'), ci('street party')]; break
  }
  if (opts.suburb) where.suburb = { equals: opts.suburb, mode: 'insensitive' }
  where.date = to ? { gte: day(from), lte: day(to) } : { gte: day(from), lte: day(addDaysKey(today, 120)) }

  const post = !!(opts.topic && POST_FILTER.has(opts.topic))
  const tonight = opts.when === 'tonight' || (!opts.when && opts.topic === 'tonight')
  const rows = await prisma.event.findMany({ where, select: landingSelect, orderBy: [{ date: 'asc' }, { time: 'asc' }], take: post || tonight ? 500 : take * 2 })
  let clean = rows
    .filter((e) => !addressInOtherState(e.venueAddress, city))
    .map((e) => presentListing(e))
  if (post && opts.topic) clean = clean.filter((e) => matchesTopic(e, opts.topic!))
  if (tonight) {
    const tonightWindow = { window: 'tonight' as const, day: today, nowMinutes: minutesNow(city.name), dropEnded: true }
    clean = orderedWindow(clean, tonightWindow).map((e) => ({
      ...e,
      availabilityKind: listingBucket(e, tonightWindow) === 'possibly' ? 'possibly' as const : undefined,
    }))
  }
  const total = post || tonight ? clean.length : await prisma.event.count({ where })
  const slice = clean.slice(0, take)
  return { events: slice, total, from, to, titles: new Set(clean.map((e) => normTitle(e.title))) }
}

export type LandingLocal = {
  id: string; title: string; category: string; description: string; suburb: string; address: string; startTime: string; endTime: string
  priceNote: string | null; date: string; schedule: string; recurring: boolean; organiserName: string
}

/** Approved VibePeep Local listings for a topic page: one row per listing (its next date), within 60 days. */
export async function landingLocal(city: CityDef, topic: TopicDef | null, opts: { suburb?: string; from?: string; to?: string; ownOnly?: boolean } = {}): Promise<LandingLocal[]> {
  if (!topic?.local && opts.suburb == null && !opts.from) return []
  const today = todayIn(city.tz)
  const from = opts.from ?? today
  const to = opts.to ?? addDaysStr(today, 60)
  const rows = await prisma.localListing.findMany({
    where: { city: city.name, status: 'APPROVED', duplicateOfId: null, expiresAt: { gte: new Date() }, ...(opts.ownOnly ? { sourceName: null } : {}), ...(topic?.local ? { category: topic.local } : {}), ...(opts.suburb ? { suburb: { equals: opts.suburb, mode: 'insensitive' } } : {}) },
    select: { id: true, title: true, category: true, description: true, suburb: true, address: true, startDate: true, endDate: true, startTime: true, endTime: true, recurrence: true, recurUntil: true, priceNote: true, organiserName: true },
    take: 400,
  })
  const filter = topic && topic.key !== 'markets' ? TOPIC_FILTER[topic.key] : undefined
  const needsFilter = topic?.key === 'pop-up-sales'
  return rows
    .filter((l) => !needsFilter || !filter || filter({ title: `${l.title} ${l.description}`, subTags: [] }))
    .map((l) => ({ l, next: occurrences(l, from, to)[0] }))
    .filter((x) => x.next)
    .map(({ l, next }) => ({ id: l.id, title: l.title, category: l.category, description: l.description, suburb: l.suburb, address: l.address, startTime: l.startTime, endTime: l.endTime, priceNote: l.priceNote, organiserName: l.organiserName, date: next!, schedule: recurrenceLabel(l), recurring: l.recurrence !== 'NONE' }))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    .filter((x, i, all) => all.findIndex((y) => localDupKey({ ...y, city: city.name }) === localDupKey({ ...x, city: city.name }) && y.startTime === x.startTime) === i)
}

export type LandingData = { events: LandingEvent[]; local: LandingLocal[]; total: number; from: string; to: string | null }

/** Everything a city/topic page shows: board events plus matching VibePeep Local listings. */
export const landingData = cache(async function landingData(city: CityDef, topic: TopicDef | null, suburb?: string, take = 60, when?: WhenKey): Promise<LandingData> {
  const ev = await landingEvents(city, { topic: topic?.key, suburb, when }, take)
  const datedTopic = !when && (topic?.key === 'tonight' || topic?.key === 'this-weekend')
  const activity = !!topic && topic.key !== 'events' && topic.key !== 'tonight' && topic.key !== 'this-weekend'
  let raw: LandingLocal[] = []
  if (topic?.local) {
    raw = await landingLocal(city, topic, {
      ...(suburb ? { suburb } : {}),
      ...(when ? { from: ev.from, to: ev.to ?? ev.from } : {}),
    })
  } else if (!activity && (when || datedTopic)) {
    raw = await landingLocal(city, null, { from: ev.from, to: ev.to ?? ev.from, ownOnly: true, ...(suburb ? { suburb } : {}) })
  } else if (!topic && !when && suburb) {
    // Organiser-submitted sales and gatherings that never arrived via a ticket feed.
    raw = await landingLocal(city, null, { suburb, ownOnly: true, from: ev.from, to: addDaysKey(ev.from, 60) })
  }
  // Imported community listings mirror board events; never show the same thing twice.
  // Tonight uses the same 5pm start rule as the board events above it.
  const night = when === 'tonight' || (!when && topic?.key === 'tonight')
  const local = raw.filter((l) => !ev.titles.has(normTitle(l.title)) && (!night || isTonightSlot(l.startTime, l.endTime)))
  return { events: ev.events, from: ev.from, to: ev.to, local, total: ev.total + local.length }
})

const totalsCache = new Map<string, { at: number; n: number }>()

/** Listing count for one city/topic page (cached 10 minutes). Count queries, not a full page render. */
export const topicTotal = cache(async function topicTotal(city: CityDef, topic: TopicDef): Promise<number> {
  const k = `${city.name}|${topic.key}`
  const hit = totalsCache.get(k)
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.n
  const events = (await landingEvents(city, { topic: topic.key }, 1)).total
  const local = topic.local
    ? await prisma.localListing.count({
        where: { city: city.name, status: 'APPROVED', duplicateOfId: null, expiresAt: { gte: new Date() }, category: topic.local },
      }).catch(() => 0)
    : 0
  const n = events + local
  totalsCache.set(k, { at: Date.now(), n })
  return n
})

/** Listing counts for every topic in a city, in parallel. */
export async function topicTotals(city: CityDef): Promise<Record<TopicKey, number>> {
  const pairs = await Promise.all(TOPICS.map(async (t) => [t.key, await topicTotal(city, t)] as const))
  return Object.fromEntries(pairs) as Record<TopicKey, number>
}

/** Upcoming listing counts per city. One grouped query for the "other cities" links. */
export const cityEventCounts = cache(async function cityEventCounts(): Promise<Record<string, number>> {
  const earliest = CITIES.map((c) => cityToday(c)).sort()[0]
  const rows = await prisma.event.groupBy({
    by: ['city'],
    where: { duplicateOfId: null, status: { not: 'CANCELLED' }, date: { gte: day(earliest), lte: day(addDaysKey(earliest, 120)) } },
    _count: { _all: true },
  }).catch(() => [])
  const out: Record<string, number> = {}
  for (const r of rows) out[r.city] = r._count._all
  return out
})

/** When listings were last refreshed from sources (for visible "updated" lines and dateModified). */
export const lastRefreshAt = cache(async function lastRefreshAt(): Promise<Date | null> {
  const r = await prisma.refreshLog.findFirst({ where: { status: 'completed' }, orderBy: { startedAt: 'desc' }, select: { endedAt: true, startedAt: true } }).catch(() => null)
  return r ? r.endedAt ?? r.startedAt : null
})

/** Suburbs in a city with enough upcoming listings to merit their own page. */
export const citySuburbs = cache(async function citySuburbs(city: CityDef, min = 3): Promise<{ name: string; slug: string; count: number }[]> {
  const today = cityToday(city)
  const rows = await prisma.event.findMany({
    where: { city: city.name, duplicateOfId: null, status: { not: 'CANCELLED' }, date: { gte: day(today), lte: day(addDaysKey(today, 120)) }, suburb: { not: null } },
    select: { suburb: true, venueAddress: true },
  })
  const counts = new Map<string, { name: string; count: number }>()
  for (const r of rows) {
    if (!isLandingSuburb(r.suburb, city) || addressInOtherState(r.venueAddress, city)) continue
    const slug = slugify(r.suburb!)
    const cur = counts.get(slug)
    counts.set(slug, { name: cur?.name ?? r.suburb!, count: (cur?.count ?? 0) + 1 })
  }
  return [...counts].filter(([, v]) => v.count >= min).sort((a, b) => b[1].count - a[1].count).map(([slug, v]) => ({ name: v.name, slug, count: v.count }))
})

export function eventImageUrl(ev: { imageUrl?: string | null; category?: string | null; imageAsset?: { variants?: unknown; status?: string } | null }, origin: string): string {
  const m = ev.imageAsset?.variants as VariantManifest | null | undefined
  const w = m?.sizes?.hero?.at(-1) ?? m?.sizes?.featured?.at(-1)
  if (m && w) {
    const url = variantUrl(m, m.sizes.hero?.length ? 'hero' : 'featured', w, 'webp')
    return url.startsWith('http') ? url : `${origin}${url}`
  }
  if (ev.imageUrl && /^https?:\/\//.test(ev.imageUrl)) return ev.imageUrl
  return placeholderAbsolute(ev.category, 'wide', origin)
}

const STATUS_SCHEMA: Record<string, string> = {
  CANCELLED: 'https://schema.org/EventCancelled',
  POSTPONED: 'https://schema.org/EventPostponed',
  RESCHEDULED: 'https://schema.org/EventRescheduled',
}

const iso = (dateKey: string, time: string | null | undefined, tz: string) =>
  time && /^\d{2}:\d{2}/.test(time) ? `${dateKey}T${time.slice(0, 5)}:00${tzOffset(tz, dateKey)}` : dateKey

type JsonLdEvent = {
  id: string; title: string; description: string | null; date: Date; endDate: Date | null; time: string | null; endTime: string | null
  venueName: string; venueAddress: string | null; suburb: string | null; city: string; latitude: number | null; longitude: number | null
  isFree: boolean; priceMin: number | null; priceMax: number | null; ticketUrl: string | null; status: string
  organiserName: string | null; organiserUrl: string | null; imageUrl: string | null; imageAsset?: { variants?: unknown } | null
  promoter?: { name: string | null; orgName: string | null } | null
}

/**
 * schema.org Event for a genuine upcoming listing. Only states what the source published:
 * no availability claims, offers only when a price was listed, status only as reported.
 */
export function eventJsonLd(ev: JsonLdEvent, origin: string) {
  const city = cityDef(ev.city)
  const startKey = ev.date.toISOString().slice(0, 10)
  const endKey = (ev.endDate ?? ev.date).toISOString().slice(0, 10)
  const image = eventImageUrl(ev, origin)
  const organiser = ev.organiserName || ev.promoter?.orgName || ev.promoter?.name
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: ev.title,
    url: `${origin}${eventPath(ev)}`,
    startDate: iso(startKey, ev.time, city.tz),
    eventStatus: STATUS_SCHEMA[ev.status] ?? 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: ev.venueName,
      address: {
        '@type': 'PostalAddress',
        ...(ev.venueAddress ? { streetAddress: ev.venueAddress } : {}),
        addressLocality: ev.suburb || city.name,
        addressRegion: city.state,
        addressCountry: 'AU',
      },
      ...(ev.latitude != null && ev.longitude != null ? { geo: { '@type': 'GeoCoordinates', latitude: ev.latitude, longitude: ev.longitude } } : {}),
    },
  }
  if (ev.endTime || ev.endDate) ld.endDate = iso(endKey, ev.endTime, city.tz)
  if (ev.description) ld.description = ev.description.slice(0, 500)
  ld.image = [image]
  if (organiser) ld.organizer = { '@type': 'Organization', name: organiser, ...(ev.organiserUrl ? { url: ev.organiserUrl } : {}) }
  if (ev.isFree) ld.isAccessibleForFree = true
  if (ev.ticketUrl && /^https?:\/\//.test(ev.ticketUrl) && (ev.isFree || ev.priceMin != null)) {
    const lo = ev.isFree ? 0 : ev.priceMin!
    const hi = ev.isFree ? 0 : ev.priceMax ?? lo
    ld.offers = hi !== lo
      ? { '@type': 'AggregateOffer', url: ev.ticketUrl, priceCurrency: 'AUD', lowPrice: lo, highPrice: hi }
      : { '@type': 'Offer', url: ev.ticketUrl, priceCurrency: 'AUD', price: lo }
  }
  return ld
}

/** Safe JSON for a <script type="application/ld+json"> tag. */
export const jsonLdString = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c')

function localTopics(l: { category: string; title: string; description: string }): TopicKey[] {
  if (l.category === 'GARAGE') return ['garage-sales']
  if (l.category === 'WAREHOUSE') return ['warehouse-sales']
  if (l.category === 'MARKET') return matchesPopup(`${l.title} ${l.description}`) ? ['markets', 'pop-up-sales'] : ['markets']
  if (l.category === 'COMMUNITY') return ['community-events']
  return []
}

async function loadGuideRows(city: CityDef, today: string): Promise<InvRow[]> {
  const until = addDaysKey(today, 120)
  const localUntil = addDaysKey(today, 60)
  const [events, locals] = await Promise.all([
    prisma.event.findMany({
      where: { city: city.name, duplicateOfId: null, status: { not: 'CANCELLED' }, date: { gte: day(today), lte: day(until) } },
      select: {
        id: true, title: true, description: true, date: true, time: true, endTime: true, venueName: true, venueAddress: true, suburb: true,
        category: true, subTags: true, isFree: true, isLGBTI: true,
      },
    }),
    prisma.localListing.findMany({
      where: { city: city.name, status: 'APPROVED', duplicateOfId: null, expiresAt: { gte: new Date() } },
      select: { id: true, title: true, description: true, category: true, suburb: true, address: true, startDate: true, endDate: true, startTime: true, endTime: true, recurrence: true, recurUntil: true, sourceName: true },
    }),
  ])
  const eventRows: InvRow[] = []
  const titles = new Set<string>()
  for (const raw of events) {
    if (addressInOtherState(raw.venueAddress, city)) continue
    const shown = presentListing({ ...raw, city: city.name })
    const suburb = raw.suburb?.trim() || null
    titles.add(normTitle(shown.title))
    eventRows.push({
      id: raw.id,
      dates: [raw.date.toISOString().slice(0, 10)],
      time: raw.time,
      endTime: raw.endTime,
      suburb,
      suburbSlug: suburb && isLandingSuburb(suburb, city) ? slugify(suburb) : null,
      source: 'event',
      topics: ACTIVITY_TOPICS.map((t) => t.key).filter((key) => matchesTopic(shown, key)),
      organiserSubmitted: false,
    })
  }
  const localRows: InvRow[] = []
  for (const l of locals) {
    if (addressInOtherState(l.address, city) || titles.has(normTitle(l.title))) continue
    const dates = occurrences(l, today, localUntil)
    if (!dates.length) continue
    const suburb = l.suburb?.trim() || null
    localRows.push({
      id: `local-${l.id}`,
      dates,
      time: l.startTime,
      endTime: l.endTime,
      suburb,
      suburbSlug: suburb && isLandingSuburb(suburb, city) ? slugify(suburb) : null,
      source: 'local',
      topics: localTopics(l),
      organiserSubmitted: !l.sourceName,
    })
  }
  return [...eventRows, ...localRows]
}

export interface CityGuideModel {
  ok: boolean
  decisions: GuideDecision[]
  suburbs: { name: string; slug: string; count: number }[]
}

const modelCache = new Map<string, { at: number; model: CityGuideModel }>()

async function loadCityGuideModel(city: CityDef): Promise<CityGuideModel> {
  const today = cityToday(city)
  const key = `${city.name}|${today}`
  const hit = modelCache.get(key)
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.model
  try {
    const rows = await loadGuideRows(city, today)
    const model: CityGuideModel = { ok: true, decisions: evaluateGuides(city, rows), suburbs: suburbDirectory(city, rows) }
    modelCache.set(key, { at: Date.now(), model })
    return model
  } catch (err) {
    console.error('guide inventory failed', city.name, err)
    return { ok: false, decisions: [], suburbs: [] }
  }
}

/** Cached inventory gates for one city. `ok: false` means the count could not be loaded. */
export const cityGuideModel = cache(loadCityGuideModel)

function withoutContext(node: Record<string, unknown>) {
  const rest = { ...node }
  delete rest['@context']
  return rest
}

/**
 * ItemList of real Event entities for a guide. Only listings passed in are described.
 */
export function guideStructuredData(input: {
  origin: string
  path: string
  heading: string
  description: string
  city: CityDef
  crumbs: { name: string; url: string }[]
  events: LandingEvent[]
  local: LandingLocal[]
  total: number
  refreshed: Date | null
  facts: GuideFact[]
}) {
  const items = [
    ...input.events.slice(0, 24).map((e) => withoutContext(eventJsonLd({ ...e, city: e.city || input.city.name }, input.origin))),
    ...input.local.slice(0, 12).map((l) => {
      const start = l.startTime && /^\d{2}:\d{2}/.test(l.startTime) ? `${l.date}T${l.startTime.slice(0, 5)}:00${tzOffset(input.city.tz, l.date)}` : l.date
      return {
        '@type': 'Event',
        name: l.title,
        url: `${input.origin}${localPath(l, l.date)}`,
        startDate: start,
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: {
          '@type': 'Place',
          name: l.suburb,
          address: { '@type': 'PostalAddress', streetAddress: l.address, addressLocality: l.suburb, addressRegion: input.city.state, addressCountry: 'AU' },
        },
        ...(l.description ? { description: l.description.slice(0, 500) } : {}),
        ...(l.organiserName ? { organizer: { '@type': 'Organization', name: l.organiserName } } : {}),
        ...(l.endTime && /^\d{2}:\d{2}/.test(l.endTime) ? { endDate: `${l.date}T${l.endTime.slice(0, 5)}:00${tzOffset(input.city.tz, l.date)}` } : {}),
      }
    }),
  ]
  return [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: input.crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })) },
    {
      '@context': 'https://schema.org', '@type': 'CollectionPage', name: input.heading, url: `${input.origin}${input.path}`, description: input.description, inLanguage: 'en-AU',
      ...(input.refreshed ? { dateModified: input.refreshed.toISOString() } : {}),
      about: { '@type': 'City', name: input.city.name, containedInPlace: { '@type': 'Country', name: 'Australia' } },
      ...(items.length ? { mainEntity: { '@type': 'ItemList', name: input.heading, numberOfItems: input.total, itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, item })) } } : {}),
    },
    ...(input.facts.length ? [{
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: input.facts.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
    }] : []),
  ]
}
