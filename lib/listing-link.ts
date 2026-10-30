/**
 * Outbound listing links. Client-safe.
 * Ticket URL, then the source listing, then the organiser, then a search on that source's site.
 * "Get tickets" only when the chosen URL is a ticket link. Everything else is "More info".
 */
import { ticketHref } from '@/lib/affiliate'
import { SOURCES } from '@/lib/quality'

const TICKET_HOST = /(^|\.)(ticketmaster|ticketek|eventbrite|humanitix|moshtix|oztix|tixr|trybooking|stickytickets|eventfinda|tixel|dice)\./i

export function usableUrl(raw?: string | null): string | null {
  if (!raw) return null
  const trimmed = String(raw).trim()
  if (!trimmed || /^(undefined|null)$/i.test(trimmed)) return null
  let parsed: URL
  try { parsed = new URL(trimmed) } catch { return null }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (!parsed.hostname.includes('.')) return null
  if (/\/(?:undefined|null)\/?$/i.test(parsed.pathname)) return null
  return parsed.toString().slice(0, 500)
}

/** Humanitix used to glue the slug onto the hostname. Split that back into a path. */
export function repairKnownListingUrl(raw?: string | null, source?: string | null): string | null {
  const url = usableUrl(raw)
  if (!url) return null
  if (source !== 'humanitix' && !/humanitix\.com/i.test(url)) return url
  try {
    const u = new URL(url)
    const glued = /^(events\.humanitix\.com)(.+)$/i.exec(u.hostname)
    if (!glued?.[2]) return url
    const path = `${glued[2].replace(/^\/+/, '')}${u.pathname === '/' ? '' : u.pathname}`
    return usableUrl(`https://${glued[1]}/${path}${u.search}`) ?? url
  } catch {
    return url
  }
}

export function joinOriginPath(origin: string, path?: string | null): string | null {
  const raw = String(path ?? '').trim()
  if (!raw || /^(undefined|null)$/i.test(raw)) return null
  if (/^https?:\/\//i.test(raw)) return usableUrl(raw)
  let base = origin.trim()
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`
  const root = base.replace(/\/+$/, '')
  const rel = raw.replace(/^\/+/, '')
  if (!rel) return null
  return usableUrl(`${root}/${rel}`)
}

export function humanitixEventUrl(hostname: unknown, slug: unknown): string | null {
  const rawSlug = String(slug ?? '').trim()
  if (!rawSlug || /^(undefined|null)$/i.test(rawSlug)) return null
  if (/^https?:\/\//i.test(rawSlug)) return usableUrl(rawSlug)
  let host = String(hostname ?? '').trim() || 'https://events.humanitix.com'
  if (!/^https?:\/\//i.test(host)) host = `https://${host}`
  return joinOriginPath(host, rawSlug)
}

export function firstListingUrl(row: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!row) return null
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string') {
      const url = usableUrl(value)
      if (url) return url
    } else if (value && typeof value === 'object' && 'url' in value && typeof (value as { url?: unknown }).url === 'string') {
      const url = usableUrl((value as { url: string }).url)
      if (url) return url
    }
  }
  return null
}

/**
 * True when this URL is where someone buys a ticket.
 * Ticketing-source ticket fields count even on an unfamiliar host. A promoter ticket field does too.
 * Any other field counts only when the host is a known ticket seller.
 */
export function isTicketLink(url: string, source?: string | null, field: 'ticket' | 'source' | 'organiser' = 'ticket'): boolean {
  try {
    if (TICKET_HOST.test(new URL(url).hostname)) return true
  } catch {
    return false
  }
  if (field !== 'ticket' || !source) return false
  if (source === 'promoter') return true
  return SOURCES[source]?.kind === 'ticketing'
}

const q = (title: string) => encodeURIComponent(title.trim().slice(0, 180))

/** Search the source's own site for the event title. Unknown sources get a web search. */
export function sourceSearchUrl(source?: string | null, title?: string | null): string {
  const name = (title ?? '').trim() || 'events'
  switch (source) {
    case 'ticketmaster':
      return `https://www.ticketmaster.com.au/search?q=${q(name)}`
    case 'eventbrite':
      return `https://www.eventbrite.com.au/d/australia/events/?q=${q(name)}`
    case 'humanitix':
      return `https://humanitix.com/au/search?query=${q(name)}`
    case 'moshtix':
      return `https://www.moshtix.com.au/v2/search?query=${q(name)}`
    case 'oztix':
      return `https://www.oztix.com.au/search?q=${q(name)}`
    case 'ticketek':
      return `https://premier.ticketek.com.au/search/SearchResults.aspx?k=${q(name)}`
    case 'cityofsydney':
      return `https://whatson.cityofsydney.nsw.gov.au/search?q=${q(name)}`
    case 'frontier':
      return `https://www.frontiertouring.com/?s=${q(name)}`
    case 'curated':
      return `https://www.google.com/search?q=${q(`${name} official`)}`
    case 'promoter':
      return `https://www.google.com/search?q=${q(`${name} tickets`)}`
    default:
      return `https://www.google.com/search?q=${q(`${name} tickets`)}`
  }
}

export type OutboundKind = 'ticket' | 'source' | 'organiser' | 'search'
export interface OutboundLink {
  href: string
  label: 'Get tickets' | 'More info'
  kind: OutboundKind
}

export function eventOutbound(ev: {
  title?: string | null
  ticketUrl?: string | null
  sourceUrl?: string | null
  organiserUrl?: string | null
  source?: string | null
}): OutboundLink {
  const ticket = usableUrl(repairKnownListingUrl(ev.ticketUrl, ev.source))
  const source = usableUrl(repairKnownListingUrl(ev.sourceUrl, ev.source))
  const org = usableUrl(ev.organiserUrl)
  const chosen = ticket
    ? { href: ticket, field: 'ticket' as const, kind: 'source' as const }
    : source
      ? { href: source, field: 'source' as const, kind: 'source' as const }
      : org
        ? { href: org, field: 'organiser' as const, kind: 'organiser' as const }
        : null
  if (!chosen) return { href: sourceSearchUrl(ev.source, ev.title), label: 'More info', kind: 'search' }
  if (isTicketLink(chosen.href, ev.source, chosen.field)) {
    return { href: ticketHref(chosen.href) ?? chosen.href, label: 'Get tickets', kind: 'ticket' }
  }
  return { href: chosen.href, label: 'More info', kind: chosen.kind }
}

/** Normalise URLs before they are stored. A non-ticket URL is kept as the source page, not as a ticket link. */
export function normalizeListingUrls(input: {
  source: string
  ticketUrl?: string | null
  sourceUrl?: string | null
  organiserUrl?: string | null
}): { ticketUrl: string | null; sourceUrl: string | null; organiserUrl: string | null } {
  let ticket = usableUrl(repairKnownListingUrl(input.ticketUrl, input.source))
  let source = usableUrl(repairKnownListingUrl(input.sourceUrl, input.source))
  const organiserUrl = usableUrl(input.organiserUrl)
  if (ticket && !isTicketLink(ticket, input.source, 'ticket')) {
    if (!source) source = ticket
    ticket = null
  }
  if (!source) source = ticket ?? organiserUrl
  return { ticketUrl: ticket, sourceUrl: source, organiserUrl }
}
