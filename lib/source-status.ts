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
  /** The listing's title, used to identity-match a JSON-LD node to this event. */
  title?: string | null
}

/** What the near-start recheck does with a status. Only a definitive negative hides. */
export function nearStartAction(status: SourceStatus): 'hide' | 'verified' | 'flag' {
  if (status === 'gone' || status === 'ended' || status === 'cancelled') return 'hide'
  if (status === 'live') return 'verified'
  return 'flag'
}

/**
 * Aggregate guard for near-start hides: at most this many listings per
 * source per pass may be hidden on recheck evidence. A reader that is
 * systematically wrong about one source (a shared page, a changed API)
 * otherwise hides its whole near-start catalogue ten listings at a time,
 * pass after pass; past the cap the definitive negatives are flagged for
 * an admin instead of hidden.
 */
export const NEAR_START_HIDE_CAP_PER_SOURCE = 3

/** Whether one more near-start hide is allowed for this source in this pass. */
export function nearStartHideAllowed(hidesBySource: ReadonlyMap<string, number>, source: string | null | undefined): boolean {
  return (hidesBySource.get(source ?? '') ?? 0) < NEAR_START_HIDE_CAP_PER_SOURCE
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
  if (!ev) {
    // An empty destination result alone is not 'gone': unlisted and draft
    // events drop out of the destination API while their listing page
    // still resolves. Only a dead listing page corroborates the absence.
    const page = await fetch({ url }).catch(() => null)
    if (page && (page.status === 404 || page.status === 410)) return 'gone'
    return 'unknown'
  }
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

type JsonLdNode = Record<string, unknown>

function jsonLdNodes(html: string): JsonLdNode[] {
  const nodes: JsonLdNode[] = []
  for (const match of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(match[1])
    } catch {
      continue
    }
    const top = Array.isArray(parsed) ? parsed : [parsed]
    for (const node of top) {
      if (!node || typeof node !== 'object') continue
      const graph = (node as JsonLdNode)['@graph']
      const inner = Array.isArray(graph) ? graph : [node]
      for (const item of inner) {
        if (item && typeof item === 'object') nodes.push(item as JsonLdNode)
      }
    }
  }
  return nodes
}

function nodeStatus(node: JsonLdNode): string | null {
  const status = node.eventStatus
  return typeof status === 'string' && status ? status : null
}

/** schema.org eventStatus named in any JSON-LD block on the page. */
export function jsonLdEventStatus(html: string): string | null {
  for (const node of jsonLdNodes(html)) {
    const status = nodeStatus(node)
    if (status) return status
  }
  return null
}

function normaliseName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function namesMatch(a: string, b: string): boolean {
  const na = normaliseName(a)
  const nb = normaliseName(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const shorter = na.length <= nb.length ? na : nb
  const longer = na.length <= nb.length ? nb : na
  return shorter.length >= 4 && longer.includes(shorter)
}

function normaliseUrl(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

function dayOf(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  return null
}

export type JsonLdExpectation = {
  name?: string | null
  date?: Date | string | null
  url?: string | null
}

/**
 * Whether a JSON-LD node is confidently THIS event. Every identity field
 * present on both sides (name, start day, URL) must agree — a shared tour
 * page carries one node per night under the same name, so a name match
 * with a different start day is a sibling, not this event — and at least
 * one field must actually agree. A node that matches on nothing is some
 * other event, and a cancelled sibling must not condemn this listing.
 */
export function jsonLdNodeMatches(node: JsonLdNode, expect: JsonLdExpectation): boolean {
  let compared = 0
  const name = typeof node.name === 'string' ? node.name : null
  if (name && expect.name) {
    compared++
    if (!namesMatch(name, expect.name)) return false
  }
  const startDay = dayOf(node.startDate)
  const expectDay = dayOf(expect.date ?? null)
  if (startDay && expectDay) {
    compared++
    if (startDay !== expectDay) return false
  }
  const url = typeof node.url === 'string' ? node.url : null
  if (url && expect.url) {
    compared++
    if (normaliseUrl(url) !== normaliseUrl(expect.url)) return false
  }
  return compared > 0
}

/**
 * The eventStatus of the JSON-LD node that identity-matches the expected
 * event. Nodes with a status but no confident match are ignored: no match
 * means unknown, never cancelled.
 */
export function jsonLdEventStatusFor(html: string, expect: JsonLdExpectation): string | null {
  for (const node of jsonLdNodes(html)) {
    const status = nodeStatus(node)
    if (status && jsonLdNodeMatches(node, expect)) return status
  }
  return null
}

async function readGeneric(url: string, fetch: PriceFetch, row: SourceStatusRow): Promise<SourceStatus> {
  const res = await fetch({ url })
  if (res.status === 404 || res.status === 410) return 'gone'
  if (unusable(res) || !res.body) return 'unknown'
  const status = jsonLdEventStatusFor(res.body, { name: row.title ?? null, date: row.date, url })
  if (status && /EventCancelled/i.test(status)) return 'cancelled'
  return 'unknown'
}

async function readUrl(url: string, fetch: PriceFetch, row: SourceStatusRow, apiKey: string | null): Promise<SourceStatus> {
  if (eventbriteEventId(url)) return (await readEventbrite(url, fetch, row)) ?? 'unknown'
  if (moshtixListingId(url)) return (await readMoshtix(url, fetch)) ?? 'unknown'
  if (ticketmasterEventId(url)) return (await readTicketmaster(url, fetch, apiKey)) ?? 'unknown'
  if (humanitixDataUrl(url)) return (await readHumanitix(url, fetch)) ?? 'unknown'
  if (cosEventSlug(url)) return (await readCos(url, fetch)) ?? 'unknown'
  return readGeneric(url, fetch, row)
}

const DEFINITIVE_NEGATIVE: SourceStatus[] = ['gone', 'ended', 'cancelled']

/**
 * Reads every stored URL for the listing and combines the verdicts. The
 * source page and the ticket link must agree before anything acts: one
 * definitive negative alongside a live read from the other URL is a
 * conflict, and a conflict is unknown — a listing is never hidden because
 * two pages disagreed about it. Agreeing negatives act (the listing of
 * record, the source URL, wins which negative is reported).
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
  const results: SourceStatus[] = []
  for (const url of unique) {
    if (isTicketekHost(url) || skipHost(url)) continue
    results.push(await readUrl(url, fetch, row, apiKey).catch(() => 'unknown' as SourceStatus))
  }
  const negatives = results.filter((status) => DEFINITIVE_NEGATIVE.includes(status))
  const hasLive = results.includes('live')
  if (hasLive && negatives.length) return 'unknown'
  if (negatives.length) return negatives[0]
  if (hasLive) return 'live'
  return 'unknown'
}
