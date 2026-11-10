/**
 * Brisbane City Council open data (CC BY 4.0).
 * Facts come from the published dataset. Photos are not copied: the dataset
 * licence covers the fields, and the image files were not separately licensed.
 * An empty response does not delete listings.
 */
import { saveEvent, sleep } from '@/lib/event-store'
import { paragraphsFromHtml } from '@/lib/description-text'
import { readPrice } from '@/lib/price'
import { usableUrl } from '@/lib/listing-link'
import { noteSourceSaved, sourceFetchSignal, yieldIfBudget } from '@/lib/source-budget'
import { emptyFeedAlert, parseFailureAlert, recordQualityAlert, retireOnEmpty, venueGapAlert } from '@/lib/source-health'

export const BCC_DATASET = 'https://data.brisbane.qld.gov.au/api/explore/v2.1/catalog/datasets/brisbane-city-council-events/records'
export const BCC_ATTRIBUTION = '© Brisbane City Council, licensed CC BY 4.0'
export const BCC_SOURCE = 'brisbanecouncil'
const PAGE = 100
const ZONE = 'Australia/Brisbane'

export type BccRecord = {
  subject?: string | null
  web_link?: string | null
  location?: string | null
  start_datetime?: string | null
  end_datetime?: string | null
  description?: string | null
  event_type?: string[] | string | null
  venue?: string | null
  venueaddress?: string | null
  cost?: string | null
  age?: string | null
  bookings?: string | null
  status?: string | null
  geolocation?: { lat?: number | null; lon?: number | null } | null
}

export type ParsedBcc = {
  title: string
  description: string | null
  date: string
  time: string
  endDate: string | null
  endTime: string | null
  venueName: string
  venueAddress: string | null
  price: string | null
  isFree: boolean
  ticketUrl: string | null
  sourceUrl: string | null
  externalId: string
  latitude: number | null
  longitude: number | null
  ageRestriction: string | null
  genres: string[]
  status: string | null
  source: typeof BCC_SOURCE
  city: 'Brisbane'
}

export type BccParseResult = {
  events: ParsedBcc[]
  parsed: number
  failed: number
  withVenue: number
}

function stripTags(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function bccExternalId(webLink: string | null | undefined): string | null {
  if (!webLink) return null
  let text = webLink
  try { text = decodeURIComponent(webLink) } catch { /* keep the raw link */ }
  const match = text.match(/eventid=(\d+)/i)
  return match?.[1] ?? null
}

export function brisbaneWall(iso: string | null | undefined): { date: string; time: string } | null {
  if (!iso) return null
  const instant = new Date(iso)
  if (Number.isNaN(instant.getTime())) return null
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  return { date, time }
}

function listingStatus(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim()
  if (!text) return null
  if (/cancel/i.test(text)) return 'CANCELLED'
  if (/postpone/i.test(text)) return 'POSTPONED'
  if (/reschedul/i.test(text)) return 'RESCHEDULED'
  return null
}

function firstHref(html: string | null | undefined): string | null {
  const match = (html ?? '').match(/href\s*=\s*["']([^"']+)["']/i)
  return usableUrl(match?.[1] ?? null)
}

function genresOf(value: BccRecord['event_type']): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

/** Map one open-data row. Address is copied only from the dataset's address field. */
export function parseBccRecord(row: BccRecord): ParsedBcc | null {
  const title = stripTags(row.subject).slice(0, 250)
  const externalId = bccExternalId(row.web_link)
  const start = brisbaneWall(row.start_datetime)
  if (!title || !externalId || !start) return null
  const end = brisbaneWall(row.end_datetime)
  const offer = readPrice(stripTags(row.cost) || null)
  const venueAddress = stripTags(row.venueaddress) || null
  const venueName = stripTags(row.venue) || stripTags(row.location) || ''
  const lat = row.geolocation?.lat
  const lon = row.geolocation?.lon
  const pin = typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)
  return {
    title,
    description: paragraphsFromHtml(row.description) || null,
    date: start.date,
    time: start.time,
    endDate: end && end.date !== start.date ? end.date : null,
    endTime: end?.time ?? null,
    venueName: venueName || 'TBA',
    venueAddress,
    price: offer.price,
    isFree: offer.isFree,
    ticketUrl: firstHref(row.bookings),
    sourceUrl: usableUrl(row.web_link),
    externalId,
    latitude: pin ? lat : null,
    longitude: pin ? lon : null,
    ageRestriction: stripTags(row.age).slice(0, 120) || null,
    genres: genresOf(row.event_type),
    status: listingStatus(row.status),
    source: BCC_SOURCE,
    city: 'Brisbane',
  }
}

export function parseBccRecords(rows: BccRecord[]): BccParseResult {
  const events: ParsedBcc[] = []
  let failed = 0
  let withVenue = 0
  for (const row of rows) {
    if (!stripTags(row.subject)) continue
    const parsed = parseBccRecord(row)
    if (!parsed) {
      failed++
      continue
    }
    events.push(parsed)
    if (parsed.venueName && parsed.venueName !== 'TBA') withVenue++
  }
  return { events, parsed: events.length, failed, withVenue }
}

async function readPage(offset: number): Promise<{ total: number; rows: BccRecord[] }> {
  const url = `${BCC_DATASET}?limit=${PAGE}&offset=${offset}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'VibePeepEventsBot/1.0 (+https://outza-outza.vercel.app)' },
    signal: sourceFetchSignal(30000),
  })
  if (!res.ok) throw new Error(`Brisbane City Council open data ${res.status}`)
  const json = await res.json() as { total_count?: number; results?: BccRecord[] }
  return { total: Number(json.total_count ?? 0), rows: Array.isArray(json.results) ? json.results : [] }
}

export async function fetchBrisbaneCouncilEvents(): Promise<number> {
  const first = await readPage(0)
  if (emptyFeedAlert(first.rows.length) || first.total === 0) {
    if (retireOnEmpty(first.rows.length)) throw new Error('empty feed must not retire listings')
    await recordQualityAlert({
      kind: 'ZERO_EVENTS',
      source: 'Brisbane City Council',
      detail: `Open-data feed returned ${first.rows.length} rows (total_count ${first.total}). Existing Brisbane City Council listings were left in place.`,
    })
    console.warn('[brisbane] empty feed; no listings deleted')
    return 0
  }
  const all: BccRecord[] = []
  let offset = 0
  let total = first.total
  while (offset < total) {
    if (yieldIfBudget('pages')) break
    const page = offset === 0 ? first : await readPage(offset)
    total = page.total || total
    if (!page.rows.length) break
    all.push(...page.rows)
    offset += page.rows.length
    if (page.rows.length < PAGE) break
    await sleep(200)
  }
  const parsed = parseBccRecords(all)
  if (parseFailureAlert(parsed.parsed, parsed.failed)) {
    await recordQualityAlert({
      kind: 'PARSE_FAILURES',
      source: 'Brisbane City Council',
      detail: `${parsed.failed} of ${parsed.parsed + parsed.failed} titled rows could not be parsed. Saved rows were kept. Nothing was deleted.`,
    })
  }
  if (venueGapAlert(parsed.withVenue, parsed.parsed)) {
    await recordQualityAlert({
      kind: 'VENUE_GAP',
      source: 'Brisbane City Council',
      detail: `${parsed.parsed - parsed.withVenue} of ${parsed.parsed} parsed rows had no venue name in the dataset.`,
    })
  }
  let saved = 0
  for (const ev of parsed.events) {
    if (yieldIfBudget('events')) break
    const ok = await saveEvent({
      title: ev.title,
      description: ev.description,
      date: ev.date,
      time: ev.time,
      endDate: ev.endDate,
      endTime: ev.endTime,
      venueName: ev.venueName,
      venueAddress: ev.venueAddress,
      price: ev.price,
      isFree: ev.isFree,
      ticketUrl: ev.ticketUrl,
      sourceUrl: ev.sourceUrl,
      latitude: ev.latitude,
      longitude: ev.longitude,
      ageRestriction: ev.ageRestriction,
      genres: ev.genres,
      status: ev.status,
      source: ev.source,
      city: ev.city,
      externalId: ev.externalId,
    }).catch((err) => {
      console.warn('[brisbane] save failed', err?.message)
      return false
    })
    if (ok) {
      saved++
      noteSourceSaved(saved)
    }
  }
  console.log(`[brisbane] parsed ${parsed.parsed}, failed ${parsed.failed}, saved ${saved}. ${BCC_ATTRIBUTION}`)
  return saved
}
