/**
 * One status read for one listing, used by the near-start recheck.
 * Mirrors the price lookup's dispatch (lib/price-lookup.ts): source APIs
 * first, the listing page last. Only a definitive answer acts. A page that
 * loads proves nothing about this occurrence (a series page can headline a
 * different night), a block or a timeout proves nothing at all, so both are
 * `unknown` and the listing is left exactly as it was.
 */
import {
  cosEventSlug,
  eventbriteEventId,
  humanitixDataUrl,
  humanitixPayloadPrice,
  isTicketekHost,
  publicUrl,
  skipHost,
  ticketmasterEventId,
} from '@/lib/price-read'
import type { PriceFetch, PriceResponse } from '@/lib/price-lookup'

export type SourceStatus = 'live' | 'gone' | 'ended' | 'cancelled' | 'unknown'

export type SourceStatusRow = {
  source: string
  ticketUrl: string | null
  sourceUrl: string | null
  date: Date
}

/** What the near-start recheck does with a status. Only a definitive negative hides. */
export function nearStartAction(status: SourceStatus): 'hide' | 'verified' | 'flag' {
  if (status === 'gone' || status === 'ended' || status === 'cancelled') return 'hide'
  if (status === 'live') return 'verified'
  return 'flag'
}

const STATUS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/** Plain fetch with the price lookup's response shape. No host gating: the recheck caps how many it runs. */
export const statusFetch: PriceFetch = async (req) => {
  try {
    const res = await fetch(req.url, {
      method: req.method ?? 'GET',
      headers: {
        'User-Agent': STATUS_UA,
        Accept: req.accept ?? 'text/html,application/json;q=0.9,*/*;q=0.8',
        ...(req.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: req.body,
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
      cache: 'no-store',
    })
    if (res.status === 429 || res.status === 503) {
      await res.body?.cancel().catch(() => {})
      return { status: res.status, body: null }
    }
    const body = await res.text()
    const blocked =
      res.status === 403 ||
      res.status === 401 ||
      (body.length < 400 && /block|captcha|access denied|just a moment/i.test(body))
    if (blocked && res.status !== 200) return { status: res.status, body: null, blocked: true }
    return { status: res.status, body }
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    return { status: 0, body: null, timedOut: name === 'AbortError' || name === 'TimeoutError' }
  }
}

function jsonBody(res: PriceResponse): unknown | null {
  if (!res.body) return null
  const trimmed = res.body.trimStart()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try {
    return JSON.parse(res.body)
  } catch {
    return null
  }
}

function unusable(res: PriceResponse): boolean {
  return res.timedOut === true || res.blocked === true || res.status === 0 || res.status === 429 || res.status >= 500
}

async function readEventbrite(url: string, fetch: PriceFetch, row: SourceStatusRow): Promise<SourceStatus | null> {
  const id = eventbriteEventId(url)
  if (!id) return null
  const api = `https://www.eventbrite.com.au/api/v3/destination/events/?event_ids=${id}&expand=ticket_availability&page_size=1`
  const res = await fetch({ url: api, accept: 'application/json' })
  if (res.status === 404 || res.status === 410) return 'gone'
  if (unusable(res)) return 'unknown'
  const json = jsonBody(res) as {
    events?: { status?: string; start?: { utc?: string; local?: string } }[]
  } | null
  if (!json) return 'unknown'
  const ev = json.events?.[0]
  if (!ev) return 'gone'
  const status = (ev.status ?? '').toLowerCase()
  if (status === 'canceled' || status === 'cancelled') return 'cancelled'
  if (status === 'ended' || status === 'completed') return 'ended'
  if (status === 'live' || status === 'started') {
    // The organiser moved this occurrence. A new start in the past means the
    // night we list no longer exists; a future move is the feed's reschedule
    // path to sort out on the next sweep, not a hide.
    const startRaw = ev.start?.utc ?? ev.start?.local
    const start = startRaw ? new Date(startRaw) : null
    if (start && !Number.isNaN(start.getTime())) {
      const movedDay = start.toISOString().slice(0, 10)
      const storedDay = row.date.toISOString().slice(0, 10)
      if (movedDay !== storedDay && start.getTime() < Date.now()) return 'ended'
    }
    return 'live'
  }
  return 'unknown'
}

/**
 * The Moshtix id in a stored listing URL. price-read's moshtixEventId only
 * accepts a moshtix.com host, but listings are stored on moshtix.com.au, so
 * the status read matches both rather than never taking the API path. (The
 * price lookup shares that quirk; changing it there is a separate call.)
 */
export function moshtixListingId(raw: string): number | null {
  const url = publicUrl(raw)
  if (!url || !/(^|\.)moshtix\.com(\.au)?$/i.test(url.hostname)) return null
  const match = url.pathname.match(/\/(\d+)\/?$/)
  if (!match) return null
  const id = Number(match[1])
  return Number.isInteger(id) && id > 0 ? id : null
}

async function readMoshtix(url: string, fetch: PriceFetch): Promise<SourceStatus | null> {
  const id = moshtixListingId(url)
  if (!id) return null
  const res = await fetch({
    url: 'https://api.moshtix.com/v1/graphql',
    method: 'POST',
    accept: 'application/json',
    body: JSON.stringify({
      query: `query($id: Int!) { viewer { getEvent(id: $id) { id } } }`,
      variables: { id },
    }),
  })
  if (res.status === 404 || res.status === 410) return 'gone'
  if (unusable(res)) return 'unknown'
  const json = jsonBody(res) as { data?: { viewer?: { getEvent?: { id?: number } | null } }; errors?: unknown } | null
  if (!json || !json.data) return 'unknown'
  return json.data.viewer?.getEvent ? 'live' : 'gone'
}

async function readTicketmaster(url: string, fetch: PriceFetch, apiKey: string | null): Promise<SourceStatus | null> {
  const id = ticketmasterEventId(url)
  if (!id) return null
  if (!apiKey) return 'unknown'
  const res = await fetch({
    url: `https://app.ticketmaster.com/discovery/v2/events/${encodeURIComponent(id)}.json?apikey=${encodeURIComponent(apiKey)}`,
    accept: 'application/json',
  })
  if (res.status === 404 || res.status === 410) return 'gone'
  if (unusable(res)) return 'unknown'
  const json = jsonBody(res) as { dates?: { status?: { code?: string } } } | null
  if (!json) return 'unknown'
  const code = (json.dates?.status?.code ?? '').toLowerCase()
  if (code === 'cancelled' || code === 'canceled') return 'cancelled'
  if (code === 'onsale') return 'live'
  // offsale, postponed and rescheduled say nothing safe about whether the
  // night itself is on. The feed's own reschedule path handles moves.
  return 'unknown'
}

async function readHumanitix(url: string, fetch: PriceFetch): Promise<SourceStatus | null> {
  const dataUrl = humanitixDataUrl(url)
  if (!dataUrl) return null
  const res = await fetch({ url: dataUrl, accept: 'application/json' })
  if (res.status === 404 || res.status === 410) return 'gone'
  if (unusable(res) || !res.body) return 'unknown'
  const parsed = humanitixPayloadPrice(res.body)
  return parsed.event ? 'live' : 'unknown'
}

async function readCos(url: string, fetch: PriceFetch): Promise<SourceStatus | null> {
  const slug = cosEventSlug(url)
  if (!slug) return null
  const api = `https://whatson.cityofsydney.nsw.gov.au/api/v1/events/eventsearch/${encodeURIComponent(slug)}`
  const res = await fetch({ url: api, accept: 'application/json' })
  if (res.status === 404 || res.status === 410) return 'gone'
  if (unusable(res)) return 'unknown'
  const record = jsonBody(res)
  return record && typeof record === 'object' && !Array.isArray(record) ? 'live' : 'unknown'
}

/** schema.org eventStatus named in any JSON-LD block on the page. */
export function jsonLdEventStatus(html: string): string | null {
  for (const match of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(match[1])
    } catch {
      continue
    }
    const nodes = Array.isArray(parsed) ? parsed : [parsed]
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue
      const graph = (node as { '@graph'?: unknown })['@graph']
      const inner = Array.isArray(graph) ? graph : [node]
      for (const item of inner) {
        if (!item || typeof item !== 'object') continue
        const status = (item as { eventStatus?: unknown }).eventStatus
        if (typeof status === 'string' && status) return status
      }
    }
  }
  return null
}

async function readGeneric(url: string, fetch: PriceFetch): Promise<SourceStatus> {
  const res = await fetch({ url })
  if (res.status === 404 || res.status === 410) return 'gone'
  if (unusable(res) || !res.body) return 'unknown'
  const status = jsonLdEventStatus(res.body)
  if (status && /EventCancelled/i.test(status)) return 'cancelled'
  return 'unknown'
}

async function readUrl(url: string, fetch: PriceFetch, row: SourceStatusRow, apiKey: string | null): Promise<SourceStatus> {
  if (eventbriteEventId(url)) return (await readEventbrite(url, fetch, row)) ?? 'unknown'
  if (moshtixListingId(url)) return (await readMoshtix(url, fetch)) ?? 'unknown'
  if (ticketmasterEventId(url)) return (await readTicketmaster(url, fetch, apiKey)) ?? 'unknown'
  if (humanitixDataUrl(url)) return (await readHumanitix(url, fetch)) ?? 'unknown'
  if (cosEventSlug(url)) return (await readCos(url, fetch)) ?? 'unknown'
  return readGeneric(url, fetch)
}

/**
 * The source page speaks first (it is the listing of record), then the
 * ticket link. The first definitive answer wins; anything less is unknown.
 */
export async function readSourceStatus(
  row: SourceStatusRow,
  fetch: PriceFetch,
  opts?: { ticketmasterKey?: string | null },
): Promise<SourceStatus> {
  const urls = [row.sourceUrl, row.ticketUrl].filter((url): url is string => !!publicUrl(url))
  const unique = [...new Set(urls)]
  if (!unique.length) return 'unknown'
  const apiKey = opts?.ticketmasterKey ?? null
  for (const url of unique) {
    if (isTicketekHost(url) || skipHost(url)) continue
    const status = await readUrl(url, fetch, row, apiKey).catch(() => 'unknown' as SourceStatus)
    if (status !== 'unknown') return status
  }
  return 'unknown'
}
