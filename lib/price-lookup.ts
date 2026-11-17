/**
 * One price lookup for one listing.
 * Source fields and APIs come first. A ticket button is followed only when
 * those fields have no price. Ticketek pages are not fetched.
 */
import { BCC_DATASET } from '@/lib/sources/brisbane-council'
import {
  PRICE_REASON,
  TRANSIENT_PRICE_REASONS,
  bccEventId,
  cosEventSlug,
  cosRecordPrice,
  eventbriteAvailabilityPrice,
  eventbriteEventId,
  explicitAdmissionPrice,
  humanitixDataUrl,
  humanitixPayloadPrice,
  humanitixTicketsHtml,
  isKnownTicketer,
  isTicketekHost,
  lookupKey,
  moshtixEventId,
  moshtixTicketsPrice,
  pagePrice,
  publicUrl,
  skipHost,
  ticketCtas,
  ticketmasterEventId,
  ticketmasterRangesPrice,
  visibleText,
} from '@/lib/price-read'
import { readPrice, type PriceRead } from '@/lib/price'

export const PRICE_ENRICH_BUDGET_MS = 180_000

export type PriceRequest = { url: string; method?: 'GET' | 'POST'; body?: string; accept?: string }
export type PriceResponse = { status: number; body: string | null; blocked?: boolean; timedOut?: boolean }
export type PriceFetch = (req: PriceRequest) => Promise<PriceResponse>

export type LookupRow = {
  source: string
  title: string
  ticketUrl: string | null
  sourceUrl: string | null
}

export type PriceOutcome = {
  price: string | null
  isFree: boolean
  min: number | null
  max: number | null
  reason: string | null
  ticketPage: string | null
}

export type PriceTarget = LookupRow & { id: string; date: Date }

export type PriceGroup = {
  key: string
  sample: PriceTarget
  urls: string[]
  ids: string[]
}

const EMPTY: PriceOutcome = { price: null, isFree: false, min: null, max: null, reason: null, ticketPage: null }

function found(read: PriceRead, ticketPage: string | null): PriceOutcome {
  return { price: read.price, isFree: read.isFree, min: read.min, max: read.max, reason: null, ticketPage }
}

function missed(reason: string, ticketPage: string | null = null): PriceOutcome {
  return { ...EMPTY, reason, ticketPage }
}

function statusReason(res: PriceResponse, ticket: boolean): string {
  if (res.timedOut) return PRICE_REASON.timedOut
  if (res.status === 429 || res.status === 503) return PRICE_REASON.rateLimited
  if (res.blocked || res.status === 401 || res.status === 403) return PRICE_REASON.blocked
  return ticket ? PRICE_REASON.ticketDown : PRICE_REASON.sourceDown
}

function jsonBody(res: PriceResponse): unknown | null {
  if (!res.body) return null
  const trimmed = res.body.trimStart()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try { return JSON.parse(res.body) } catch { return null }
}

export function groupTargets(rows: PriceTarget[]): PriceGroup[] {
  const groups = new Map<string, PriceGroup>()
  for (const row of rows) {
    const urls = [row.ticketUrl, row.sourceUrl].filter((url): url is string => !!publicUrl(url))
    const key = urls.map((url) => lookupKey(url)).find((url): url is string => !!url) ?? `id:${row.id}`
    const existing = groups.get(key)
    if (existing) {
      existing.ids.push(row.id)
      for (const url of urls) if (!existing.urls.includes(url)) existing.urls.push(url)
      continue
    }
    groups.set(key, { key, sample: row, urls, ids: [row.id] })
  }
  return [...groups.values()]
}

async function readHumanitix(url: string, fetch: PriceFetch): Promise<PriceOutcome | null> {
  const dataUrl = humanitixDataUrl(url)
  if (!dataUrl) return null
  const res = await fetch({ url: dataUrl, accept: 'application/json' })
  if (!res.body || res.status >= 400) return missed(statusReason(res, false), url)
  const parsed = humanitixPayloadPrice(res.body)
  if (!parsed.event) return missed(PRICE_REASON.sourceDown, url)
  if (parsed.read?.price) return found(parsed.read, url)
  const page = publicUrl(url)
  const ticketsUrl = page ? `https://${page.hostname}${page.pathname.replace(/\/+$/, '')}/tickets` : null
  if (!ticketsUrl) return missed(PRICE_REASON.humanitix, url)
  const tickets = await fetch({ url: ticketsUrl })
  if (!tickets.body || tickets.status >= 400) return missed(statusReason(tickets, true), ticketsUrl)
  const fromTickets = humanitixTicketsHtml(tickets.body)
  if (fromTickets?.price) return found(fromTickets, ticketsUrl)
  return missed(PRICE_REASON.humanitix, url)
}

async function readCos(url: string, fetch: PriceFetch, apiKey: string | null): Promise<PriceOutcome | null> {
  const slug = cosEventSlug(url)
  if (!slug) return null
  const api = `https://whatson.cityofsydney.nsw.gov.au/api/v1/events/eventsearch/${encodeURIComponent(slug)}`
  const res = await fetch({ url: api, accept: 'application/json' })
  const record = jsonBody(res)
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    if (res.status >= 400 || !res.body) return missed(statusReason(res, false), url)
    return null
  }
  const read = cosRecordPrice(record as Record<string, unknown>)
  if (read?.price) return found(read, url)
  const link = (record as { ticketingLink?: unknown }).ticketingLink
  const next = typeof link === 'string' && publicUrl(link) && lookupKey(link) !== lookupKey(url) ? link : null
  if (!next) return null
  if (isTicketekHost(next)) return missed(PRICE_REASON.ticketek, next)
  return readTarget(next, fetch, 1, apiKey)
}

async function readMoshtix(url: string, fetch: PriceFetch): Promise<PriceOutcome | null> {
  const id = moshtixEventId(url)
  if (!id) return null
  const res = await fetch({
    url: 'https://api.moshtix.com/v1/graphql',
    method: 'POST',
    accept: 'application/json',
    body: JSON.stringify({
      query: `query($id: Int!) { viewer { getEvent(id: $id) { id } getTicketTypes(eventId: $id, pageSize: 50, publicOnly: true) { items { ticketPrice hidden complimentary donation addOn } } } }`,
      variables: { id },
    }),
  })
  const json = jsonBody(res) as { data?: { viewer?: { getEvent?: { id?: number } | null; getTicketTypes?: { items?: { ticketPrice?: unknown; hidden?: boolean; complimentary?: boolean; donation?: boolean; addOn?: boolean }[] } } } } | null
  if (!json) return res.status >= 400 || !res.body ? missed(statusReason(res, false), url) : null
  const event = json.data?.viewer?.getEvent
  const tickets = json.data?.viewer?.getTicketTypes?.items ?? []
  const read = moshtixTicketsPrice(tickets)
  if (read?.price) return found(read, url)
  if (event) return missed(PRICE_REASON.moshtix, url)
  return null
}

async function readEventbrite(url: string, fetch: PriceFetch): Promise<PriceOutcome | null> {
  const id = eventbriteEventId(url)
  if (!id) return null
  const api = `https://www.eventbrite.com.au/api/v3/destination/events/?event_ids=${id}&expand=ticket_availability&page_size=1`
  const res = await fetch({ url: api, accept: 'application/json' })
  const json = jsonBody(res) as { events?: { ticket_availability?: { is_free?: boolean; minimum_ticket_price?: unknown; maximum_ticket_price?: unknown } }[] } | null
  const availability = json?.events?.[0]?.ticket_availability
  const read = eventbriteAvailabilityPrice(availability)
  if (read?.price) return found(read, url)
  const page = await fetch({ url })
  if (!page.body || page.status >= 400) {
    if (availability && availability.is_free === false) return missed(PRICE_REASON.unfixed, url)
    return missed(statusReason(page, false), url)
  }
  const fromPage = pagePrice(page.body)
  if (fromPage?.price) return found(fromPage, url)
  if (availability && availability.is_free === false && !explicitAdmissionPrice(visibleText(page.body))) return missed(PRICE_REASON.unfixed, url)
  return null
}

async function readTicketmaster(url: string, fetch: PriceFetch, apiKey: string | null): Promise<PriceOutcome | null> {
  const id = ticketmasterEventId(url)
  if (!id) return null
  if (!apiKey) return missed(PRICE_REASON.ticketmasterKey, url)
  const res = await fetch({ url: `https://app.ticketmaster.com/discovery/v2/events/${encodeURIComponent(id)}.json?apikey=${encodeURIComponent(apiKey)}`, accept: 'application/json' })
  const json = jsonBody(res) as { priceRanges?: { type?: string; min?: unknown; max?: unknown }[] } | null
  if (!json) return missed(statusReason(res, true), url)
  const read = ticketmasterRangesPrice(json.priceRanges)
  if (read?.price) return found(read, url)
  return missed(PRICE_REASON.ticketmaster, url)
}

async function readBrisbane(url: string, fetch: PriceFetch, apiKey: string | null): Promise<PriceOutcome | null> {
  const id = bccEventId(url)
  if (!id) return null
  const api = `${BCC_DATASET}?limit=5&where=${encodeURIComponent(`web_link like "%eventid=${id}%"`)}`
  const res = await fetch({ url: api, accept: 'application/json' })
  const json = jsonBody(res) as { results?: { cost?: string | null; bookings?: string | null }[] } | null
  const row = json?.results?.find((item) => item.cost || item.bookings) ?? json?.results?.[0]
  if (row) {
    const read = readPrice(row.cost ?? null)
    if (read.price) return found(read, url)
    const booking = typeof row.bookings === 'string' ? row.bookings.match(/https?:\/\/[^"'\s<]+/)?.[0] : null
    if (booking && !isTicketekHost(booking) && lookupKey(booking) !== lookupKey(url)) return readTarget(booking, fetch, 1, apiKey)
    if (booking && isTicketekHost(booking)) return missed(PRICE_REASON.ticketek, booking)
  }
  return null
}

async function readGeneric(url: string, fetch: PriceFetch, hopsLeft: number, apiKey: string | null): Promise<PriceOutcome> {
  const res = await fetch({ url })
  if (!res.body || res.status >= 400) return missed(statusReason(res, hopsLeft < 2), url)
  const read = pagePrice(res.body)
  if (read?.price) return found(read, url)
  if (hopsLeft <= 0) return missed(PRICE_REASON.unpublished, url)
  const links = ticketCtas(res.body, url).filter((link) => lookupKey(link) !== lookupKey(url))
  const ticketek = ticketCtasIncludingTicketek(res.body, url)
  if (!links.length && ticketek.length) return missed(PRICE_REASON.ticketek, ticketek[0])
  for (const link of links) {
    if (/hotel|package|accommodation/i.test(link) && !isKnownTicketer(link)) continue
    if (!isKnownTicketer(link) && hopsLeft < 2) continue
    const next = await readTarget(link, fetch, hopsLeft - 1, apiKey)
    if (next?.price || (next?.reason && next.reason !== PRICE_REASON.unpublished)) return next
  }
  return missed(PRICE_REASON.unpublished, url)
}

function ticketCtasIncludingTicketek(html: string, base: string): string[] {
  const out: string[] = []
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!/^(get tickets|buy tickets|book tickets|book now|register|register now|buy now|tickets|book)$/i.test(text)) continue
    try {
      const absolute = new URL(match[1], base).toString()
      if (isTicketekHost(absolute)) out.push(absolute)
    } catch { /* skip a bad href */ }
  }
  return out
}

async function readTarget(url: string, fetch: PriceFetch, hopsLeft: number, apiKey: string | null): Promise<PriceOutcome | null> {
  if (!publicUrl(url) || skipHost(url)) {
    return isTicketekHost(url) ? missed(PRICE_REASON.ticketek, url) : null
  }
  if (humanitixDataUrl(url)) return readHumanitix(url, fetch)
  if (cosEventSlug(url)) return readCos(url, fetch, apiKey)
  if (moshtixEventId(url)) return readMoshtix(url, fetch)
  if (eventbriteEventId(url)) return readEventbrite(url, fetch)
  if (ticketmasterEventId(url)) return readTicketmaster(url, fetch, apiKey)
  if (bccEventId(url)) {
    const direct = await readBrisbane(url, fetch, apiKey)
    if (direct?.price || direct?.reason) return direct
  }
  return readGeneric(url, fetch, hopsLeft, apiKey)
}

export async function resolveEventPrice(row: LookupRow, fetch: PriceFetch, opts?: { ticketmasterKey?: string | null }): Promise<PriceOutcome> {
  const urls = [row.ticketUrl, row.sourceUrl].filter((url): url is string => !!publicUrl(url))
  const unique = [...new Set(urls.map((url) => lookupKey(url)).filter((url): url is string => !!url))]
  if (!unique.length) return missed(PRICE_REASON.noLink)
  const key = opts?.ticketmasterKey ?? null
  let fallback: PriceOutcome | null = null
  for (const url of unique) {
    if (isTicketekHost(url)) continue
    let outcome: PriceOutcome | null = null
    if (ticketmasterEventId(url)) outcome = await readTicketmaster(url, fetch, key)
    else if (humanitixDataUrl(url)) outcome = await readHumanitix(url, fetch)
    else if (moshtixEventId(url)) outcome = await readMoshtix(url, fetch)
    else if (eventbriteEventId(url)) outcome = await readEventbrite(url, fetch)
    else if (cosEventSlug(url)) outcome = await readCos(url, fetch, key)
    else if (bccEventId(url)) outcome = await readBrisbane(url, fetch, key)
    if (outcome?.price) return outcome
    if (outcome?.reason === PRICE_REASON.moshtix) {
      const page = await readGeneric(url, fetch, 1, key)
      if (page.price) return page
      if (page.reason && TRANSIENT_PRICE_REASONS.has(page.reason)) return page
      return outcome
    }
    if (outcome?.reason) return outcome
    const page = await readGeneric(url, fetch, 2, key)
    if (page.price) return page
    if (page.reason && TRANSIENT_PRICE_REASONS.has(page.reason)) return page
    fallback = page
  }
  if (unique.every((url) => isTicketekHost(url))) return missed(PRICE_REASON.ticketek, unique[0])
  return fallback ?? missed(PRICE_REASON.unpublished, unique[0])
}
