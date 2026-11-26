/**
 * Read-only check: Ticketmaster Discovery totals against the public board.
 * Not a cron. Does not write to the database. Never prints the API key.
 *
 *   TICKETMASTER_API_KEY=… npx tsx scripts/measure-venue-coverage.ts
 *
 * Discovery limits: 5,000 calls/day, 5/second, and size * page must stay under 1,000.
 * Known venue ids come from ticketmaster.com.au venue pages. Other ids are resolved
 * with a keyword search and used only when one Australian venue name matches.
 */
const BOARD = 'https://outza-outza.vercel.app/api/events'
const DISCOVERY = 'https://app.ticketmaster.com/discovery/v2'
const PAGE_SIZE = 200

type BoardVenue = {
  id: string
  name: string
  venueId?: string
  keyword?: string
  terms: string[]
  re: RegExp
}

type TmVenue = { id: string; name: string; city: string | null; country: string | null }

const VENUES: BoardVenue[] = [
  { id: 'sydney-opera-house', name: 'Sydney Opera House', keyword: 'Sydney Opera House', terms: ['Opera House'], re: /opera house/i },
  { id: 'enmore-theatre', name: 'Enmore Theatre', keyword: 'Enmore Theatre', terms: ['Enmore Theatre'], re: /enmore theatre/i },
  { id: 'factory-theatre', name: 'Factory Theatre', venueId: '158155', terms: ['Factory Theatre'], re: /factory theatre/i },
  { id: 'icc-sydney', name: 'ICC Sydney', keyword: 'ICC Sydney', terms: ['ICC Sydney'], re: /icc sydney|international convention centre/i },
  { id: 'tiktok-entertainment-centre', name: 'TikTok Entertainment Centre', keyword: 'TikTok Entertainment Centre', terms: ['TikTok Entertainment'], re: /tiktok entertainment/i },
  { id: 'afterpay-arena', name: 'Afterpay Arena', keyword: 'Afterpay Arena', terms: ['Afterpay Arena', 'Qudos'], re: /afterpay arena|qudos|allphones|acer arena|super ?dome/i },
  { id: 'accor-stadium', name: 'Accor Stadium', keyword: 'Accor Stadium', terms: ['Accor Stadium', 'Stadium Australia'], re: /accor stadium|stadium australia|\banz stadium|telstra stadium/i },
  { id: 'allianz-stadium', name: 'Allianz Stadium', keyword: 'Allianz Stadium', terms: ['Allianz Stadium'], re: /allianz stadium|sydney football stadium/i },
  { id: 'scg', name: 'Sydney Cricket Ground', keyword: 'Sydney Cricket Ground', terms: ['Sydney Cricket Ground', 'SCG'], re: /sydney cricket ground|\bscg\b/i },
  { id: 'commbank-stadium', name: 'CommBank Stadium', keyword: 'CommBank Stadium', terms: ['CommBank Stadium'], re: /commbank stadium|bankwest stadium|western sydney stadium/i },
  { id: 'mcdonald-jones', name: 'McDonald Jones Stadium', keyword: 'McDonald Jones Stadium', terms: ['McDonald Jones'], re: /mcdonald jones|hunter stadium|energyaustralia stadium|ausgrid stadium/i },
  { id: 'win-stadium', name: 'WIN Stadium', venueId: '157281', terms: ['WIN Stadium'], re: /win stadium|wollongong stadium/i },
  { id: 'win-entertainment-centre', name: 'WIN Entertainment Centre', venueId: '157282', terms: ['WIN Entertainment'], re: /win entertainment/i },
  { id: 'state-theatre', name: 'State Theatre Sydney', venueId: '155858', terms: ['State Theatre'], re: /state theatre/i },
]

function redact(value: string): string {
  return value.replace(/apikey=[^&\s]+/gi, 'apikey=redacted')
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function discovery(path: string, params: Record<string, string>, apiKey: string): Promise<unknown> {
  const url = new URL(`${DISCOVERY}/${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  url.searchParams.set('apikey', apiKey)
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Discovery ${path} HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'request failed'
    throw new Error(redact(message))
  }
}

async function boardCount(venue: BoardVenue): Promise<number> {
  const seen = new Set<string>()
  for (const term of venue.terms) {
    for (let page = 1; page <= 6; page++) {
      const res = await fetch(`${BOARD}?search=${encodeURIComponent(term)}&limit=300&page=${page}`)
      if (!res.ok) throw new Error(`board HTTP ${res.status}`)
      const json = await res.json() as { events?: { id?: string; venueName?: string }[]; totalPages?: number }
      for (const event of json.events ?? []) {
        if (event.id && venue.re.test(event.venueName ?? '')) seen.add(event.id)
      }
      if (page >= (json.totalPages || 1)) break
    }
  }
  return seen.size
}

function asVenues(payload: unknown): TmVenue[] {
  const embedded = (payload as { _embedded?: { venues?: Record<string, unknown>[] } })._embedded?.venues ?? []
  return embedded.map((venue) => {
    const city = venue.city as { name?: string } | undefined
    const country = venue.country as { countryCode?: string } | undefined
    return {
      id: String(venue.id ?? ''),
      name: String(venue.name ?? ''),
      city: city?.name ?? null,
      country: country?.countryCode ?? null,
    }
  }).filter((venue) => venue.id && venue.name)
}

function chooseVenue(keyword: string, venues: TmVenue[]): { venueId: string } | { candidates: TmVenue[] } {
  const want = keyword.trim().toLowerCase()
  const exact = venues.filter((venue) => venue.name.trim().toLowerCase() === want && (venue.country == null || venue.country === 'AU'))
  if (exact.length === 1) return { venueId: exact[0].id }
  return { candidates: venues.map((venue) => ({ ...venue })) }
}

function totalElements(payload: unknown): number | null {
  const total = (payload as { page?: { totalElements?: number } }).page?.totalElements
  return typeof total === 'number' ? total : null
}

async function main() {
  const apiKey = process.env.TICKETMASTER_API_KEY?.trim() || ''
  const rows: Record<string, unknown>[] = []
  for (const venue of VENUES) {
    const board = await boardCount(venue)
    const row: Record<string, unknown> = { id: venue.id, name: venue.name, publicBoardRows: board }
    if (!apiKey) {
      row.discovery = 'skipped: TICKETMASTER_API_KEY is not set'
      rows.push(row)
      continue
    }
    await sleep(250)
    let venueId = venue.venueId ?? null
    if (!venueId && venue.keyword) {
      const found = await discovery('venues.json', { keyword: venue.keyword, countryCode: 'AU', size: '20' }, apiKey)
      await sleep(250)
      const choice = chooseVenue(venue.keyword, asVenues(found))
      if ('venueId' in choice) venueId = choice.venueId
      else row.candidates = choice.candidates
    }
    row.venueId = venueId
    if (venueId) {
      const all = await discovery('events.json', { venueId, countryCode: 'AU', size: String(PAGE_SIZE) }, apiKey)
      await sleep(250)
      const startDateTime = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
      const upcoming = await discovery('events.json', { venueId, countryCode: 'AU', size: String(PAGE_SIZE), startDateTime }, apiKey)
      row.discoveryTotalElements = totalElements(all)
      row.discoveryUpcoming = totalElements(upcoming)
    }
    rows.push(row)
  }
  console.log(JSON.stringify({ measuredAt: new Date().toISOString(), discovery: apiKey ? 'queried' : 'skipped', rows }, null, 2))
}

main().catch((err) => {
  console.error(redact(err instanceof Error ? err.message : 'coverage check failed'))
  process.exitCode = 1
})
