/**
 * Source-partner rules. No database. A partner sees listings from assigned source keys
 * and, when set, listings whose ticket or source link uses an assigned host.
 * Counts stay aggregate. Owner names, emails and user ids never leave this layer.
 */
import type { Prisma } from '@prisma/client'
import { CITIES } from '@/lib/cities'
import { clickRate } from '@/lib/organiser-reach'
import { formatPrice } from '@/lib/price'
import { cityToday } from '@/lib/seo'
import { csvEscape } from '@/lib/organiser-reach'

export const PARTNER_ROLE = 'PARTNER'
export const PARTNER_PAGE_SIZE = 40
export const SEARCH_TERM_MIN = 5

export type PartnerSourceScope = {
  sourceKey: string
  hostPatterns: string[]
}

export type PartnerStatusFilter =
  | 'any' | 'board' | 'past' | 'hidden' | 'review' | 'removed' | 'duplicate'
  | 'cancelled' | 'postponed' | 'rescheduled' | 'sold_out'

export type PartnerPriceFilter = 'any' | 'tba' | 'free' | 'priced'
export type PartnerClaimFilter = 'any' | 'yes' | 'no'
export type PartnerSort = 'date' | 'title' | 'city' | 'category' | 'views' | 'saves' | 'itinerary' | 'clicks'

export type PartnerFilters = {
  q: string
  city: string
  category: string
  status: PartnerStatusFilter
  price: PartnerPriceFilter
  claimed: PartnerClaimFilter
  from: string
  to: string
  sort: PartnerSort
  dir: 'asc' | 'desc'
  page: number
  engagement: '7' | '28' | '90'
}

const STATUSES = new Set<PartnerStatusFilter>(['any', 'board', 'past', 'hidden', 'review', 'removed', 'duplicate', 'cancelled', 'postponed', 'rescheduled', 'sold_out'])
const PRICES = new Set<PartnerPriceFilter>(['any', 'tba', 'free', 'priced'])
const CLAIMS = new Set<PartnerClaimFilter>(['any', 'yes', 'no'])
const SORTS = new Set<PartnerSort>(['date', 'title', 'city', 'category', 'views', 'saves', 'itinerary', 'clicks'])

const TBA_WORDS = ['tba', 'tbc', 'n/a', 'na', 'price tba', 'price tbc', 'see website', 'various', 'poa', 'price on application', 'unknown', 'coming soon', '-', '—', '–']

export type ListingBadge = {
  key: 'board' | 'past' | 'hidden' | 'review' | 'removed' | 'duplicate' | 'cancelled' | 'postponed' | 'rescheduled' | 'sold_out'
  label: string
}

export type ScopeEvent = {
  source: string
  sources?: string[] | null
  ticketUrl?: string | null
  sourceUrl?: string | null
  recordSources?: string[] | null
  recordUrls?: string[] | null
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

export function oneParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value ?? '').trim()
}

export function parsePartnerFilters(input: Record<string, string | string[] | undefined>): PartnerFilters {
  const status = oneParam(input.status) as PartnerStatusFilter
  const price = oneParam(input.price) as PartnerPriceFilter
  const claimed = oneParam(input.claimed) as PartnerClaimFilter
  const sort = oneParam(input.sort) as PartnerSort
  const dir = oneParam(input.dir) === 'asc' ? 'asc' : 'desc'
  const engagement = oneParam(input.engagement)
  const page = Number(oneParam(input.page) || '1')
  const from = oneParam(input.from)
  const to = oneParam(input.to)
  return {
    q: oneParam(input.q).slice(0, 80),
    city: oneParam(input.city).slice(0, 40),
    category: oneParam(input.category).slice(0, 40),
    status: STATUSES.has(status) ? status : 'any',
    price: PRICES.has(price) ? price : 'any',
    claimed: CLAIMS.has(claimed) ? claimed : 'any',
    from: DAY.test(from) ? from : '',
    to: DAY.test(to) ? to : '',
    sort: SORTS.has(sort) ? sort : 'date',
    dir: oneParam(input.dir) ? dir : 'desc',
    page: Number.isFinite(page) && page > 0 ? Math.min(Math.floor(page), 5000) : 1,
    engagement: engagement === '7' || engagement === '90' ? engagement : '28',
  }
}

export function filtersToQuery(filters: PartnerFilters, page = filters.page): string {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.city) params.set('city', filters.city)
  if (filters.category) params.set('category', filters.category)
  if (filters.status !== 'any') params.set('status', filters.status)
  if (filters.price !== 'any') params.set('price', filters.price)
  if (filters.claimed !== 'any') params.set('claimed', filters.claimed)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.sort !== 'date') params.set('sort', filters.sort)
  if (filters.dir !== 'desc') params.set('dir', filters.dir)
  if (filters.engagement !== '28') params.set('engagement', filters.engagement)
  if (page > 1) params.set('page', String(page))
  const text = params.toString()
  return text ? `?${text}` : ''
}

/** Hosts are lowercase names, never a full URL. `www.` is stripped so one pattern covers both. */
export function normaliseHost(raw: string): string | null {
  let value = raw.trim().toLowerCase()
  if (!value) return null
  value = value.replace(/^https?:\/\//, '').split('/')[0].split('?')[0].replace(/:\d+$/, '').replace(/^\*\./, '').replace(/\.$/, '')
  if (value.startsWith('www.')) value = value.slice(4)
  if (!/^[a-z0-9.-]+$/.test(value) || !value.includes('.') || value.includes('..') || value.length < 4) return null
  return value
}

export function parseHostList(raw: string): string[] {
  const hosts = raw.split(/[\s,]+/).map(normaliseHost).filter((host): host is string => !!host)
  return [...new Set(hosts)].slice(0, 8)
}

export function normaliseSourceKey(raw: string): string | null {
  const key = raw.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(key)) return null
  return key
}

export function urlHost(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const name = new URL(raw).hostname.toLowerCase().replace(/\.$/, '')
    return name.startsWith('www.') ? name.slice(4) : name
  } catch {
    return null
  }
}

export function hostMatches(url: string | null | undefined, host: string): boolean {
  const name = urlHost(url)
  if (!name || !host) return false
  return name === host || name.endsWith(`.${host}`)
}

export function eventMatchesScope(event: ScopeEvent, scope: PartnerSourceScope[]): boolean {
  const keys = new Set(scope.map((row) => row.sourceKey).filter(Boolean))
  const hosts = scope.flatMap((row) => row.hostPatterns)
  if (keys.has(event.source)) return true
  if ((event.sources ?? []).some((key) => keys.has(key))) return true
  if ((event.recordSources ?? []).some((key) => keys.has(key))) return true
  const urls = [event.ticketUrl, event.sourceUrl, ...(event.recordUrls ?? [])]
  return hosts.some((host) => urls.some((url) => hostMatches(url, host)))
}

/** Same match the list query uses. An empty scope matches nothing. */
export function partnerScopeWhere(scope: PartnerSourceScope[]): Prisma.EventWhereInput {
  const keys = [...new Set(scope.map((row) => row.sourceKey).filter(Boolean))]
  const hosts = [...new Set(scope.flatMap((row) => row.hostPatterns))]
  const or: Prisma.EventWhereInput[] = []
  if (keys.length) {
    or.push({ source: { in: keys } })
    or.push({ sources: { hasSome: keys } })
    or.push({ sourceRecords: { some: { source: { in: keys } } } })
  }
  for (const host of hosts) {
    const needles = [`://${host}`, `://www.${host}`, `.${host}`]
    for (const needle of needles) {
      or.push({ ticketUrl: { contains: needle, mode: 'insensitive' } })
      or.push({ sourceUrl: { contains: needle, mode: 'insensitive' } })
    }
    or.push({ sourceRecords: { some: { OR: [
      { canonicalUrl: { contains: host, mode: 'insensitive' } },
      { sourceUrl: { contains: host, mode: 'insensitive' } },
    ] } } })
  }
  if (!or.length) return { id: { in: [] } }
  return { OR: or }
}

/** Titles the public board already holds back. Kept in step with PUBLIC_EVENT_AND. */
export function titleHeldBack(title: string | null | undefined): boolean {
  const text = (title ?? '').trim().toLowerCase()
  if (!text) return false
  return text === 'test'
    || text.startsWith('test ')
    || text.startsWith('[test')
    || text.includes('test test')
    || text.includes('private event')
    || text.includes('[model pending')
    || text.includes('[model unconfirmed')
}

export function titleHeldBackWhere(): Prisma.EventWhereInput {
  return { OR: [
    { title: { equals: 'test', mode: 'insensitive' } },
    { title: { startsWith: 'test ', mode: 'insensitive' } },
    { title: { startsWith: '[test', mode: 'insensitive' } },
    { title: { contains: 'test test', mode: 'insensitive' } },
    { title: { contains: 'private event', mode: 'insensitive' } },
    { title: { contains: '[model pending', mode: 'insensitive' } },
    { title: { contains: '[model unconfirmed', mode: 'insensitive' } },
  ] }
}

export type ListingFacts = {
  title: string
  date: Date | string
  endDate?: Date | string | null
  city?: string | null
  status?: string | null
  statusSource?: string | null
  hidden?: boolean | null
  moderationStatus?: string | null
  approvalState?: string | null
  deletedAt?: Date | string | null
  duplicateOfId?: string | null
}

function utcMidnight(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`)
}

export function isPastListing(event: { date: Date | string; endDate?: Date | string | null; city?: string | null }, now = new Date()): boolean {
  const last = event.endDate ?? event.date
  const key = (typeof last === 'string' ? last : last.toISOString()).slice(0, 10)
  const city = CITIES.find((item) => item.name === event.city) ?? CITIES[0]
  return key < cityToday(city, now)
}

function dayGroups(now: Date): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const city of CITIES) {
    const today = cityToday(city, now)
    groups.set(today, [...(groups.get(today) ?? []), city.name])
  }
  return groups
}

/** Last day before today in the listing's city. A positive match, so null end dates stay in one branch. */
export function pastWhere(now = new Date()): Prisma.EventWhereInput {
  const or: Prisma.EventWhereInput[] = []
  for (const [today, names] of dayGroups(now)) {
    const start = utcMidnight(today)
    or.push({
      city: { in: names },
      OR: [{ endDate: { lt: start } }, { AND: [{ endDate: null }, { date: { lt: start } }] }],
    })
  }
  const sydney = utcMidnight(cityToday(CITIES[0], now))
  or.push({
    city: { notIn: CITIES.map((city) => city.name) },
    OR: [{ endDate: { lt: sydney } }, { AND: [{ endDate: null }, { date: { lt: sydney } }] }],
  })
  return { OR: or }
}

/** Still running today or later. Kept positive so a null finish date is not dropped by NOT. */
export function upcomingWhere(now = new Date()): Prisma.EventWhereInput {
  const or: Prisma.EventWhereInput[] = []
  for (const [today, names] of dayGroups(now)) {
    const start = utcMidnight(today)
    or.push({
      city: { in: names },
      OR: [{ endDate: { gte: start } }, { AND: [{ endDate: null }, { date: { gte: start } }] }],
    })
  }
  const sydney = utcMidnight(cityToday(CITIES[0], now))
  or.push({
    city: { notIn: CITIES.map((city) => city.name) },
    OR: [{ endDate: { gte: sydney } }, { AND: [{ endDate: null }, { date: { gte: sydney } }] }],
  })
  return { OR: or }
}

export function publicListingWhere(): Prisma.EventWhereInput {
  return {
    deletedAt: null,
    hidden: false,
    duplicateOfId: null,
    AND: [
      { OR: [{ approvalState: null }, { approvalState: 'APPROVED' }] },
      { OR: [{ moderationStatus: null }, { moderationStatus: { not: 'review' } }] },
      { NOT: titleHeldBackWhere() },
    ],
    NOT: { status: 'CANCELLED', statusSource: 'promoter' },
  }
}

export function priceKind(event: { isFree?: boolean | null; price?: string | null; priceMin?: number | null; priceMax?: number | null }): 'free' | 'priced' | 'tba' {
  const shown = formatPrice(!!event.isFree, event.price ?? null, event.priceMin, event.priceMax)
  if (shown.kind === 'free') return 'free'
  if (shown.kind === 'unknown') return 'tba'
  return 'priced'
}

export function priceLabel(event: { isFree?: boolean | null; price?: string | null; priceMin?: number | null; priceMax?: number | null }): string {
  const kind = priceKind(event)
  if (kind === 'tba') return 'Price TBA'
  const shown = formatPrice(!!event.isFree, event.price ?? null, event.priceMin, event.priceMax)
  return shown.prefix ? `${shown.prefix} ${shown.value}` : shown.value
}

export function priceTbaWhere(): Prisma.EventWhereInput {
  return {
    isFree: false,
    priceMin: null,
    OR: [
      { price: null },
      { price: '' },
      ...TBA_WORDS.map((word) => ({ price: { equals: word, mode: 'insensitive' as const } })),
    ],
  }
}

export function statusWhere(status: PartnerStatusFilter, now = new Date()): Prisma.EventWhereInput | null {
  switch (status) {
    case 'any': return null
    case 'board': return { AND: [publicListingWhere(), upcomingWhere(now)] }
    case 'past': return pastWhere(now)
    case 'hidden': return { OR: [{ hidden: true }, { moderationStatus: 'hidden' }, titleHeldBackWhere()] }
    case 'review': return { OR: [{ moderationStatus: 'review' }, { approvalState: 'PENDING' }] }
    case 'removed': return { OR: [{ deletedAt: { not: null } }, { approvalState: { in: ['REJECTED', 'REMOVED'] } }] }
    case 'duplicate': return { duplicateOfId: { not: null } }
    case 'cancelled': return { status: 'CANCELLED' }
    case 'postponed': return { status: 'POSTPONED' }
    case 'rescheduled': return { status: 'RESCHEDULED' }
    case 'sold_out': return { status: 'SOLD_OUT' }
    default: return null
  }
}

export function listingBadges(event: ListingFacts, now = new Date()): ListingBadge[] {
  const badges: ListingBadge[] = []
  if (event.deletedAt || event.approvalState === 'REJECTED' || event.approvalState === 'REMOVED') badges.push({ key: 'removed', label: 'Removed' })
  else if (event.moderationStatus === 'review' || event.approvalState === 'PENDING') badges.push({ key: 'review', label: 'In review' })
  else if (event.hidden || event.moderationStatus === 'hidden' || titleHeldBack(event.title)) badges.push({ key: 'hidden', label: 'Hidden' })
  else if (event.duplicateOfId) badges.push({ key: 'duplicate', label: 'Duplicate' })
  else if (isPastListing(event, now)) badges.push({ key: 'past', label: 'Past' })
  else if (!(event.status === 'CANCELLED' && event.statusSource === 'promoter')) badges.push({ key: 'board', label: 'On the board' })
  if (event.status === 'CANCELLED') badges.push({ key: 'cancelled', label: 'Cancelled' })
  else if (event.status === 'POSTPONED') badges.push({ key: 'postponed', label: 'Postponed' })
  else if (event.status === 'RESCHEDULED') badges.push({ key: 'rescheduled', label: 'Rescheduled' })
  else if (event.status === 'SOLD_OUT') badges.push({ key: 'sold_out', label: 'Sold out' })
  return badges
}

function dayStart(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`)
}

export function partnerListWhere(scope: PartnerSourceScope[], filters: PartnerFilters, now = new Date()): Prisma.EventWhereInput {
  const and: Prisma.EventWhereInput[] = [partnerScopeWhere(scope)]
  if (filters.city) and.push({ city: filters.city })
  if (filters.category) and.push({ category: filters.category })
  const status = statusWhere(filters.status, now)
  if (status) and.push(status)
  if (filters.price === 'tba') and.push(priceTbaWhere())
  if (filters.price === 'free') and.push({ isFree: true })
  if (filters.price === 'priced') and.push({ NOT: { OR: [{ isFree: true }, priceTbaWhere()] } })
  if (filters.claimed === 'yes') and.push({ promoterId: { not: null } })
  if (filters.claimed === 'no') and.push({ promoterId: null })
  const from = filters.from && filters.to && filters.from > filters.to ? filters.to : filters.from
  const to = filters.from && filters.to && filters.from > filters.to ? filters.from : filters.to
  if (from) and.push({ date: { gte: dayStart(from) } })
  if (to) and.push({ date: { lt: new Date(dayStart(to).getTime() + 86400000) } })
  const words = filters.q.split(/\s+/).map((word) => word.trim()).filter((word) => word.length > 1).slice(0, 6)
  for (const word of words) {
    and.push({ OR: [
      { title: { contains: word, mode: 'insensitive' } },
      { venueName: { contains: word, mode: 'insensitive' } },
      { suburb: { contains: word, mode: 'insensitive' } },
      { city: { contains: word, mode: 'insensitive' } },
    ] })
  }
  return { AND: and }
}

export function partnerOrderBy(sort: PartnerSort, dir: 'asc' | 'desc'): Prisma.EventOrderByWithRelationInput {
  if (sort === 'title') return { title: dir }
  if (sort === 'city') return { city: dir }
  if (sort === 'category') return { category: dir }
  if (sort === 'views') return { views: dir }
  if (sort === 'clicks') return { ticketClicks: dir }
  if (sort === 'itinerary') return { itineraryAdds: dir }
  if (sort === 'saves') return { savedBy: { _count: dir } }
  return { date: dir }
}

export function ctrLabel(clicks: number, views: number): string | null {
  const rate = clickRate(clicks, views)
  if (rate == null) return null
  return `${rate.toLocaleString('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

export function csvFormulaSafe(value: string | number | null | undefined): string | number | null {
  if (typeof value !== 'string') return value ?? null
  if (/^[=+\-@]/.test(value)) return `'${value}`
  return value
}

export function partnerCsv(header: string[], rows: (string | number | null)[][]): string {
  const safe = (value: string | number | null) => csvEscape(csvFormulaSafe(value))
  return [header.map((cell) => safe(cell)).join(','), ...rows.map((row) => row.map((cell) => safe(cell)).join(','))].join('\n') + '\n'
}

export const PARTNER_CSV_HEADER = [
  'Title', 'Starts', 'Ends', 'City', 'Suburb', 'Category', 'Venue', 'Status', 'Schedule',
  'Price', 'Claimed by an owner', 'Views', 'Saves', 'Itinerary adds', 'Get tickets clicks', 'Click-through',
  'Stored source', 'VibePeep URL', 'Source URL', 'Ticket URL', 'Event id',
]

export const STATUS_OPTIONS: { value: PartnerStatusFilter; label: string }[] = [
  { value: 'any', label: 'Any status' },
  { value: 'board', label: 'On the board' },
  { value: 'past', label: 'Past' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'review', label: 'In review' },
  { value: 'removed', label: 'Removed' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'postponed', label: 'Postponed' },
  { value: 'rescheduled', label: 'Rescheduled' },
  { value: 'sold_out', label: 'Sold out' },
]
