/**
 * One-off coverage measurement against the live public board and the
 * Brisbane City Council open-data feed. Prints JSON. Does not write to the database.
 */
import { compareCatalogue, decideDuplicate, type IdentityEvent } from '../lib/event-identity'
import { parseBccRecords, type BccRecord } from '../lib/sources/brisbane-council'

const BOARD = 'https://outza-outza.vercel.app/api/events'
const FEED = 'https://data.brisbane.qld.gov.au/api/explore/v2.1/catalog/datasets/brisbane-city-council-events/records'
const TODAY = '2026-11-03'
const UNTIL = '2027-02-01'

async function bccRows(): Promise<BccRecord[]> {
  const all: BccRecord[] = []
  let offset = 0
  let total = Infinity
  while (offset < total) {
    const res = await fetch(`${FEED}?limit=100&offset=${offset}`, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`BCC ${res.status}`)
    const json = await res.json() as { total_count?: number; results?: BccRecord[] }
    total = Number(json.total_count ?? 0)
    const rows = json.results ?? []
    if (!rows.length) break
    all.push(...rows)
    offset += rows.length
    if (rows.length < 100) break
  }
  return all
}

async function board(params: Record<string, string>): Promise<{ total: number; events: Record<string, unknown>[] }> {
  const events: Record<string, unknown>[] = []
  let total = 0
  for (let page = 1; page < 40; page++) {
    const qs = new URLSearchParams({ ...params, limit: '300', page: String(page) })
    const res = await fetch(`${BOARD}?${qs}`)
    if (!res.ok) throw new Error(`board ${res.status}`)
    const json = await res.json() as { total?: number; events?: Record<string, unknown>[] }
    total = Number(json.total ?? 0)
    const batch = json.events ?? []
    events.push(...batch)
    const pages = Math.max(1, Math.ceil(total / 300))
    if (page >= pages || batch.length === 0) break
  }
  return { total, events }
}

function asIdentity(row: Record<string, unknown>): IdentityEvent {
  const date = String(row.date ?? '').slice(0, 10)
  return {
    title: String(row.title ?? ''),
    venueName: String(row.venueName ?? ''),
    city: String(row.city ?? ''),
    date,
    time: (row.time as string | null) ?? null,
    source: String(row.source ?? ''),
    address: (row.venueAddress as string | null) ?? null,
    price: (row.price as string | null) ?? null,
    url: (row.sourceUrl as string | null) || (row.ticketUrl as string | null) || null,
    status: String(row.status ?? 'SCHEDULED'),
  }
}

function countBy(rows: Record<string, unknown>[], key: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of rows) {
    const value = String(row[key] ?? '')
    out[value] = (out[value] ?? 0) + 1
  }
  return out
}

const VENUES = [
  'Sydney Opera House',
  'Enmore Theatre',
  'Factory Theatre',
  'ICC Sydney',
  'International Convention Centre',
  'TikTok Entertainment Centre',
  'Afterpay Arena',
  'Qudos Bank Arena',
  'Accor Stadium',
  'ANZ Stadium',
  'Allianz Stadium',
  'Sydney Cricket Ground',
  'SCG',
  'CommBank Stadium',
  'Bankwest Stadium',
  'McDonald Jones Stadium',
  'WIN Stadium',
  'WIN Entertainment Centre',
  'State Theatre',
]

function venueHits(events: Record<string, unknown>[]): Record<string, number> {
  const hits: Record<string, number> = {}
  for (const name of VENUES) hits[name] = 0
  for (const event of events) {
    const venue = String(event.venueName ?? '')
    for (const name of VENUES) {
      if (venue.toLowerCase().includes(name.toLowerCase())) hits[name]++
    }
  }
  return hits
}

async function main() {
const rows = await bccRows()
const parsed = parseBccRecords(rows)
const windowed = parsed.events.filter((event) => event.date >= TODAY && event.date <= UNTIL)
const source: IdentityEvent[] = windowed.map((event) => ({
  title: event.title,
  venueName: event.venueName,
  city: event.city,
  date: event.date,
  time: event.time,
  source: event.source,
  address: event.venueAddress,
  price: event.price,
  url: event.sourceUrl,
  status: event.status ?? 'SCHEDULED',
  externalId: event.externalId,
}))
const brisbane = await board({ city: 'Brisbane', dateFrom: TODAY, dateTo: `${UNTIL}T23:59:59.000Z` })
const catalogue = brisbane.events.map(asIdentity)
const audit = compareCatalogue(source, catalogue)
const byDate = new Map<string, IdentityEvent[]>()
for (const row of catalogue) {
  const list = byDate.get(row.date) ?? []
  list.push(row)
  byDate.set(row.date, list)
}
const uncertainExamples: { source: string; venue: string; date: string; time: string | null; match: string; matchVenue: string; confidence: number }[] = []
for (const row of source) {
  if (uncertainExamples.length >= 12) break
  if (row.status === 'CANCELLED' || row.status === 'POSTPONED' || row.status === 'RESCHEDULED') continue
  let best: { confidence: number; action: string; title: string; venue: string } | null = null
  for (const other of byDate.get(row.date) ?? []) {
    const found = decideDuplicate(row, other)
    if (!best || found.confidence > best.confidence) best = { confidence: found.confidence, action: found.action, title: other.title, venue: other.venueName }
  }
  if (best?.action === 'review') {
    uncertainExamples.push({ source: row.title, venue: row.venueName, date: row.date, time: row.time ?? null, match: best.title, matchVenue: best.venue, confidence: best.confidence })
  }
}
const sydney = await board({ city: 'Sydney', dateFrom: TODAY, dateTo: `${UNTIL}T23:59:59.000Z` })
const newcastle = await board({ city: 'Newcastle', dateFrom: TODAY, dateTo: `${UNTIL}T23:59:59.000Z` })

console.log(JSON.stringify({
  measuredOn: new Date().toISOString(),
  bcc: {
    feedRows: rows.length,
    parsed: parsed.parsed,
    failed: parsed.failed,
    withVenue: parsed.withVenue,
    in90Days: windowed.length,
    outside90Days: parsed.events.filter((event) => event.date < TODAY || event.date > UNTIL).length,
    cancelledInWindow: windowed.filter((event) => event.status === 'CANCELLED' || event.status === 'POSTPONED' || event.status === 'RESCHEDULED').length,
  },
  audit,
  uncertainExamples,
  brisbaneBoard: { total: brisbane.total, fetched: brisbane.events.length, bySource: countBy(brisbane.events, 'source'), byCategory: countBy(brisbane.events, 'category') },
  sydneyVenueHits: venueHits(sydney.events),
  sydneyBoardTotal: sydney.total,
  newcastleVenueHits: venueHits(newcastle.events),
  newcastleBoardTotal: newcastle.total,
}, null, 2))
}

main()
