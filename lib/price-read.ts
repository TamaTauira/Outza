/**
 * Read a ticket price from source fields or a page.
 * A number is returned only when the source published it. Free is returned
 * only when the source says the event is free. Otherwise the result is empty.
 */
import { cosListedPrice } from '@/lib/cos-event'
import { humanitixListingsFromJson } from '@/lib/humanitix-refresh'
import { moneyNumber, priceFromAmounts, readPrice, type PriceRead } from '@/lib/price'

const FREE: PriceRead = { price: 'Free', isFree: true, min: 0, max: 0, fromOnly: false }

export const PRICE_REASON = {
  noLink: 'no listing or ticket link',
  sourceDown: 'source page did not load',
  ticketDown: 'ticket page did not load',
  rateLimited: 'source rate limited the lookup',
  timedOut: 'lookup timed out',
  blocked: 'ticket page blocked the lookup',
  unpublished: 'no price published on the source or its ticket page',
  ticketmaster: 'Ticketmaster did not publish a price range',
  ticketmasterKey: 'Ticketmaster discovery API key is not set',
  moshtix: 'Moshtix did not publish a ticket price',
  humanitix: 'Humanitix did not publish a ticket price',
  ticketek: 'ticket link is Ticketek, which is not fetched',
  unfixed: 'no fixed ticket price (donation or pay on arrival)',
} as const

export const TRANSIENT_PRICE_REASONS = new Set<string>([
  PRICE_REASON.sourceDown,
  PRICE_REASON.ticketDown,
  PRICE_REASON.rateLimited,
  PRICE_REASON.timedOut,
  PRICE_REASON.blocked,
  PRICE_REASON.ticketmasterKey,
])

const TICKET_HOST = /(^|\.)(ticketmaster|eventbrite|humanitix|moshtix|oztix|trybooking|stickytickets|eventfinda|tixel|dice|tixr)\./i
const SKIP_HOST = /(^|\.)(facebook|instagram|twitter|x|tiktok|youtube|youtu\.be|google|apple|spotify|linktr\.ee)\./i

export function lookupKey(raw: string | null | undefined): string | null {
  const url = publicUrl(raw)
  if (!url) return null
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) url.searchParams.delete(key)
  }
  url.hostname = url.hostname.toLowerCase()
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString()
}

export function publicUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null
  let url: URL
  try { url = new URL(raw.trim()) } catch { return null }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase()
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return null
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0)/.test(host)) return null
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return null
  return url
}

export function isTicketekHost(raw: string): boolean {
  const url = publicUrl(raw)
  return !!url && /(^|\.)ticketek\./i.test(url.hostname)
}

export function isKnownTicketer(raw: string): boolean {
  const url = publicUrl(raw)
  return !!url && TICKET_HOST.test(url.hostname)
}

export function skipHost(raw: string): boolean {
  const url = publicUrl(raw)
  if (!url) return true
  return SKIP_HOST.test(url.hostname) || isTicketekHost(raw)
}

export function humanitixDataUrl(raw: string): string | null {
  const url = publicUrl(raw)
  if (!url || !/humanitix\.com$/i.test(url.hostname)) return null
  const path = url.pathname.replace(/\/+$/, '')
  if (!path || path === '/' || path.split('/').filter(Boolean).length > 3) return null
  return `https://${url.hostname.toLowerCase()}${path}/__data.json`
}

export function ticketmasterEventId(raw: string): string | null {
  const url = publicUrl(raw)
  if (!url || !/ticketmaster\./i.test(url.hostname)) return null
  const match = url.pathname.match(/\/event\/([A-Za-z0-9]+)\/?$/)
  return match?.[1] ?? null
}

export function moshtixEventId(raw: string): number | null {
  const url = publicUrl(raw)
  if (!url || !/moshtix\.com$/i.test(url.hostname)) return null
  const match = url.pathname.match(/\/(\d+)\/?$/)
  if (!match) return null
  const id = Number(match[1])
  return Number.isInteger(id) && id > 0 ? id : null
}

export function eventbriteEventId(raw: string): string | null {
  const url = publicUrl(raw)
  if (!url || !/eventbrite\./i.test(url.hostname)) return null
  const match = url.pathname.match(/(?:tickets-|^\/e\/)(\d{6,})/) ?? url.pathname.match(/(\d{8,})/)
  return match?.[1] ?? null
}

export function cosEventSlug(raw: string): string | null {
  const url = publicUrl(raw)
  if (!url || !/whatson\.cityofsydney\.nsw\.gov\.au$/i.test(url.hostname)) return null
  const match = url.pathname.match(/\/events\/([^/]+)\/?$/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

export function bccEventId(raw: string): string | null {
  if (!raw) return null
  const match = raw.match(/eventid(?:=|%3D)(\d+)/i)
  return match?.[1] ?? null
}

export function humanitixPayloadPrice(body: string): { event: boolean; read: PriceRead | null } {
  const listings = humanitixListingsFromJson(body)
  if (!listings.length) return { event: false, read: null }
  const nums = listings.flatMap((listing) => listing.prices).filter((n) => n > 0)
  if (!nums.length) {
    const zeros = listings.some((listing) => listing.prices.some((n) => n === 0))
    return { event: true, read: zeros ? FREE : null }
  }
  return { event: true, read: priceFromAmounts(Math.min(...nums), Math.max(...nums)) }
}

export function cosRecordPrice(record: Record<string, unknown> | null | undefined): PriceRead | null {
  const text = cosListedPrice(record)
  const flagged = record?.isFree === true || record?.isFree === 'true' || record?.freeEvent === true || record?.freeEvent === 'true'
  const read = readPrice(text, flagged && !text)
  return read.price ? read : null
}

/** Hidden, donation and add-on tickets are ignored. Complimentary-only lists are free. */
export function moshtixTicketsPrice(tickets: { ticketPrice?: unknown; hidden?: boolean; complimentary?: boolean; donation?: boolean; addOn?: boolean }[]): PriceRead | null {
  const visible = tickets.filter((ticket) => !ticket.hidden && !ticket.donation && !ticket.addOn)
  const nums = visible.map((ticket) => ticket.complimentary ? 0 : moneyNumber(ticket.ticketPrice)).filter((n): n is number => n != null && n >= 0)
  const paid = nums.filter((n) => n > 0)
  if (paid.length) return priceFromAmounts(Math.min(...paid), Math.max(...paid))
  if (visible.some((ticket) => ticket.complimentary) || nums.some((n) => n === 0)) return FREE
  return null
}

export function ticketmasterRangesPrice(ranges: { type?: string; min?: unknown; max?: unknown }[] | null | undefined): PriceRead | null {
  if (!ranges?.length) return null
  const chosen = ranges.find((range) => /including fees/i.test(range.type ?? '')) ?? ranges[0]
  const min = moneyNumber(chosen.min)
  const max = moneyNumber(chosen.max)
  if ((min == null || min <= 0) && (max == null || max <= 0)) return null
  return priceFromAmounts(min != null && min > 0 ? min : max, max != null && max > 0 ? max : min, { fromOnly: min != null && min > 0 && (max == null || max <= 0) })
}

export function eventbriteAvailabilityPrice(availability: { is_free?: boolean; minimum_ticket_price?: unknown; maximum_ticket_price?: unknown; min_price?: unknown; max_price?: unknown } | null | undefined): PriceRead | null {
  if (!availability) return null
  const min = moneyNumber(availability.minimum_ticket_price ?? availability.min_price)
  const max = moneyNumber(availability.maximum_ticket_price ?? availability.max_price)
  if ((min != null && min > 0) || (max != null && max > 0)) {
    return priceFromAmounts(min != null && min > 0 ? min : max, max != null && max > 0 ? max : min, { fromOnly: min != null && min > 0 && (max == null || max === min) && max == null })
  }
  if (availability.is_free === true) return FREE
  return null
}

/** A price written as the admission cost. Ignores a page full of unrelated amounts. */
export function explicitAdmissionPrice(text: string): PriceRead | null {
  const from: number[] = []
  const amounts: number[] = []
  const take = (bucket: number[], raw: string) => {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0 && n < 5000) bucket.push(Math.round(n * 100) / 100)
  }
  for (const match of text.matchAll(/\b(?:from|starting(?:\s+at)?)\s+\$\s?(\d{1,4}(?:\.\d{2})?)\b/gi)) take(from, match[1])
  for (const match of text.matchAll(/\$\s?(\d{1,4}(?:\.\d{2})?)\s+per\s+(?:class|person|ticket|session|entry|head)\b/gi)) take(amounts, match[1])
  for (const match of text.matchAll(/\b(?:tickets?|entry|admission|cost)\s*(?:is|:|from)?\s*\$\s?(\d{1,4}(?:\.\d{2})?)\b/gi)) take(amounts, match[1])
  const nums = [...from, ...amounts]
  const distinct = [...new Set(nums)]
  if (!distinct.length || distinct.length > 4) return null
  const fromOnly = from.length > 0 && amounts.length === 0 && distinct.length === 1
  return priceFromAmounts(Math.min(...distinct), Math.max(...distinct), { fromOnly })
}

export function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000)
}

function ldNodes(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const walk = (node: unknown) => {
    if (!node) return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (typeof node !== 'object') return
    const record = node as Record<string, unknown>
    if (Array.isArray(record['@graph'])) walk(record['@graph'])
    out.push(record)
  }
  for (const block of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(block[1].trim())) } catch { /* a broken block is skipped */ }
  }
  return out
}

function eventNodes(nodes: Record<string, unknown>[]): Record<string, unknown>[] {
  return nodes.filter((node) => {
    const type = node['@type']
    const types = Array.isArray(type) ? type : [type]
    return types.some((item) => typeof item === 'string' && /Event$/i.test(item))
  })
}

function offerPrice(offers: unknown, freeFlag: boolean): PriceRead | null {
  const list = Array.isArray(offers) ? offers : offers && typeof offers === 'object' ? [offers] : []
  const nums: number[] = []
  let fromOnly = false
  for (const offer of list) {
    if (!offer || typeof offer !== 'object') continue
    const row = offer as Record<string, unknown>
    const type = String(row['@type'] ?? '')
    if (/AggregateOffer/i.test(type)) {
      const low = moneyNumber(row.lowPrice)
      const high = moneyNumber(row.highPrice)
      if (low != null && low > 0) nums.push(low)
      if (high != null && high > 0 && high !== low) nums.push(high)
      if (low != null && low > 0 && (high == null || high <= 0)) fromOnly = true
    } else {
      const n = moneyNumber(row.price)
      if (n != null && n > 0) nums.push(n)
    }
  }
  if (!nums.length) return freeFlag ? FREE : null
  const distinct = new Set(nums)
  return priceFromAmounts(Math.min(...nums), Math.max(...nums), { fromOnly: fromOnly && distinct.size === 1 })
}

/** Schema.org Event offers. A zero offer is not treated as free unless the event is marked free. */
export function jsonLdPrice(html: string): PriceRead | null {
  const events = eventNodes(ldNodes(html))
  if (!events.length) return null
  const reads = events.map((event) => offerPrice(event.offers, event.isAccessibleForFree === true))
  const priced = reads.filter((read): read is PriceRead => !!read?.price && !read.isFree)
  if (priced.length) {
    const mins = priced.map((read) => read.min).filter((n): n is number => n != null)
    const maxes = priced.map((read) => read.max).filter((n): n is number => n != null)
    return priceFromAmounts(Math.min(...mins), Math.max(...maxes), { fromOnly: priced.every((read) => read.fromOnly) && new Set(mins).size === 1 && new Set(maxes).size === 1 })
  }
  if (reads.some((read) => read?.isFree)) return FREE
  return null
}

export function oztixSaysFree(html: string): boolean {
  return /<div[^>]*class="[^"]*event-tag[^"]*"[^>]*>\s*Free Event\s*<\/div>/i.test(html)
}

export function eventbriteNextPrice(html: string): PriceRead | null {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!match) return null
  try {
    const data = JSON.parse(match[1]) as { props?: { pageProps?: { context?: { seo?: { offersSchema?: unknown }; basicInfo?: { hasDonationTicketsAvailable?: boolean } } } } }
    const offers = data.props?.pageProps?.context?.seo?.offersSchema
    const list = Array.isArray(offers) ? offers : []
    const nums: number[] = []
    for (const offer of list) {
      if (!offer || typeof offer !== 'object') continue
      const row = offer as { lowPrice?: unknown; highPrice?: unknown }
      const low = moneyNumber(row.lowPrice)
      const high = moneyNumber(row.highPrice)
      if (low != null && low > 0) nums.push(low)
      if (high != null && high > 0 && high !== low) nums.push(high)
    }
    if (nums.length) return priceFromAmounts(Math.min(...nums), Math.max(...nums))
    return null
  } catch {
    return null
  }
}

const CTA = /^(get tickets|buy tickets|book tickets|book now|register|register now|buy now|tickets|book)$/i

export function ticketCtas(html: string, base: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!CTA.test(text) && !/\b(get tickets|buy tickets|book now|book tickets|register now)\b/i.test(text)) continue
    let absolute: string
    try { absolute = new URL(match[1], base).toString() } catch { continue }
    const key = lookupKey(absolute)
    if (!key || seen.has(key) || skipHost(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

export function pagePrice(html: string): PriceRead | null {
  return jsonLdPrice(html) ?? eventbriteNextPrice(html) ?? explicitAdmissionPrice(visibleText(html)) ?? (oztixSaysFree(html) ? FREE : null)
}
