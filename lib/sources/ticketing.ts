import { saveEvent, toSydneyParts, sleep } from '@/lib/event-store'
import { CITIES, type CityDef } from '@/lib/cities'

const UA = 'OutzaEventsBot/1.0 (+https://outza.abacusai.app)'

/** Metro postcode ranges, used when a feed gives a postcode but no coordinates. */
const POSTCODES: Record<string, [number, number][]> = {
  Sydney: [[2000, 2249], [2555, 2574], [2740, 2786]],
  Newcastle: [[2280, 2310], [2318, 2324]],
  Canberra: [[2600, 2620], [2900, 2914]],
  Melbourne: [[3000, 3210], [3335, 3341], [3427, 3438], [3750, 3810], [3910, 3944], [3975, 3978]],
  Brisbane: [[4000, 4207], [4300, 4306], [4500, 4521]],
  'Gold Coast': [[4208, 4230]],
  Adelaide: [[5000, 5199]],
  Perth: [[6000, 6199]],
  Hobart: [[7000, 7055]],
  Darwin: [[800, 832]],
}

function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = Math.PI / 180
  const x = (bLng - aLng) * r * Math.cos(((aLat + bLat) / 2) * r)
  const y = (bLat - aLat) * r
  return Math.sqrt(x * x + y * y) * 6371
}

/** Which Outza city a venue belongs to (coordinates first, then postcode). */
function cityFor(lat: number | null | undefined, lng: number | null | undefined, postcode?: string | null): CityDef | null {
  if (lat != null && lng != null && (lat || lng)) {
    const hit = CITIES.find((c) => km(lat, lng, c.lat, c.lng) <= c.radiusKm)
    if (hit) return hit
  }
  const pc = parseInt(postcode ?? '', 10)
  if (!Number.isFinite(pc)) return null
  const name = Object.keys(POSTCODES).find((n) => POSTCODES[n].some(([a, b]) => pc >= a && pc <= b))
  return name ? CITIES.find((c) => c.name === name) ?? null : null
}

const title = (s: string) => (s === s.toUpperCase() && /[A-Z]{3}/.test(s) ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s)

function priceRange(prices: number[]): { price: string | null; isFree: boolean } {
  const p = prices.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b)
  if (!p.length) return { price: null, isFree: false }
  const lo = Math.round(p[0])
  const hi = Math.round(p[p.length - 1])
  return { price: lo === hi ? `$${lo}` : `$${lo} - $${hi}`, isFree: false }
}

// ---------------- Moshtix (official open GraphQL API, public events only) ----------------

const MOSHTIX_QUERY = `query($page: Int, $from: Date) { viewer { getEvents(pageIndex: $page, pageSize: 200, publicOnly: true, searchableOnly: true, excludeClosed: true, sortBy: STARTDATE, sortByDirection: ASC, eventStartDateFrom: $from) {
  totalCount items { id name startDate endDate eventUrl teaser description ageRestriction status
    category { name } genre { name }
    venue { name address { line1 locality region postCode } location { latitude longitude } }
    images { items { url type } }
    ticketTypes(pageSize: 50) { items { ticketPrice hidden complimentary donation addOn } } } } } }`

export async function fetchMoshtixEvents(): Promise<number> {
  const from = new Date(Date.now() - 6 * 3600000).toISOString()
  let saved = 0
  let total = Infinity
  for (let page = 0; page * 200 < total && page < 30; page++) {
    const res = await fetch('https://api.moshtix.com/v1/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ query: MOSHTIX_QUERY, variables: { page, from } }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error(`Moshtix API ${res.status}`)
    const json: any = await res.json()
    const conn = json?.data?.viewer?.getEvents
    if (!conn) throw new Error(json?.errors?.[0]?.message ?? 'Moshtix API returned no data')
    total = conn.totalCount ?? 0
    for (const e of conn.items ?? []) {
      try {
        if (e?.status && e.status !== 'LIVE') continue
        const v = e?.venue ?? {}
        const a = v.address ?? {}
        const city = cityFor(v.location?.latitude, v.location?.longitude, a.postCode)
        const sd = e?.startDate ? new Date(e.startDate) : null
        if (!city || !sd || isNaN(sd.getTime())) continue
        const ed = e?.endDate ? new Date(e.endDate) : null
        const s = toSydneyParts(sd, city.tz)
        const en = ed && !isNaN(ed.getTime()) && ed > sd ? toSydneyParts(ed, city.tz) : null
        const tickets: any[] = (e?.ticketTypes?.items ?? []).filter((t: any) => !t.hidden && !t.complimentary && !t.donation && !t.addOn)
        const { price, isFree } = priceRange(tickets.map((t) => Number(t.ticketPrice)))
        const main = (e?.images?.items ?? []).find((i: any) => i?.type === 'MAIN' && /x\d+x\d+$/.test(i.url ?? ''))
        const venueName = String(v.name ?? 'TBA').replace(new RegExp(`,\\s*${city.name}$`, 'i'), '')
        const locality = a.locality ? title(String(a.locality)) : null
        const ok = await saveEvent({
          title: title(String(e.name ?? '')),
          description: e.teaser || e.description || null,
          date: s.date,
          time: s.time,
          endDate: en?.date,
          endTime: en?.time,
          venueName: title(venueName),
          venueAddress: [a.line1, locality, [a.region, a.postCode].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null,
          genres: [e?.category?.name, e?.genre?.name].filter(Boolean),
          price,
          isFree,
          imageUrl: main ? main.url.replace(/x\d+x\d+$/, 'x600x600') : null,
          ticketUrl: e.eventUrl ?? null,
          latitude: v.location?.latitude ?? null,
          longitude: v.location?.longitude ?? null,
          ageRestriction: e.ageRestriction === 'OVER18' ? '18+' : e.ageRestriction === 'UNDER18' ? 'Under 18s' : e.ageRestriction === 'ALL' ? 'All ages' : null,
          source: 'moshtix',
          city: city.name,
        })
        if (ok) saved++
      } catch (err: any) {
        console.error(`[moshtix] event error: ${err?.message}`)
      }
    }
    await sleep(1000)
  }
  console.log(`[moshtix] saved ${saved} events`)
  return saved
}

// ---------------- Oztix (public event guide search used by oztix.com.au) ----------------

const OZTIX_APP = 'ICGFYQWGTD'
const DAY = 86400

async function oztixQuery(params: string): Promise<any> {
  const res = await fetch(`https://${OZTIX_APP}-dsn.algolia.net/1/indexes/prod_oztix_eventguide/query`, {
    method: 'POST',
    headers: {
      'X-Algolia-Application-Id': OZTIX_APP,
      'X-Algolia-API-Key': process.env.OZTIX_ALGOLIA_KEY ?? '',
      'Content-Type': 'application/json',
      'User-Agent': UA,
    },
    body: JSON.stringify({ params }),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`Oztix search ${res.status}`)
  return res.json()
}

export async function fetchOztixEvents(): Promise<number> {
  if (!process.env.OZTIX_ALGOLIA_KEY) throw new Error('OZTIX_ALGOLIA_KEY is not set')
  const now = Math.floor(Date.now() / 1000)
  const fields = 'EventName,EventDescription,SpecialGuests,DateStartUnix,DateEndUnix,EventUrl,EventImage1,Categories,Bands,Venue,_geoloc,MinPrice,PriceFrom,IsCancelled,IsPostponed,IsRescheduled,HasEventDatePassed'
  let saved = 0
  for (const city of CITIES) {
    const seen = new Set<string>()
    // 30-day windows keep every query under the search engine's 1,000-hit cap
    for (let w = 0; w < 12; w++) {
      const a = now + w * 30 * DAY
      const b = a + 30 * DAY
      const r = await oztixQuery(
        `query=&hitsPerPage=1000&aroundLatLng=${city.lat},${city.lng}&aroundRadius=${city.radiusKm * 1000}` +
        `&filters=${encodeURIComponent(`DateStartUnix >= ${a} AND DateStartUnix < ${b}`)}&attributesToRetrieve=${fields}&attributesToHighlight=`,
      )
      for (const e of r?.hits ?? []) {
        try {
          if (seen.has(e.objectID) || e.HasEventDatePassed) continue
          seen.add(e.objectID)
          const v = e.Venue ?? {}
          const tz = v.Timezone || city.tz
          const s = toSydneyParts(new Date(e.DateStartUnix * 1000), tz)
          const en = e.DateEndUnix > e.DateStartUnix ? toSydneyParts(new Date(e.DateEndUnix * 1000), tz) : null
          const from = Number(e.PriceFrom ?? e.MinPrice)
          const status = e.IsCancelled ? 'CANCELLED' : e.IsPostponed ? 'POSTPONED' : e.IsRescheduled ? 'RESCHEDULED' : 'SCHEDULED'
          const guests = e.SpecialGuests ? `With ${e.SpecialGuests}. ` : ''
          const ok = await saveEvent({
            title: String(e.EventName ?? ''),
            description: `${guests}${e.EventDescription ?? ''}`.trim() || null,
            date: s.date,
            time: s.time,
            endDate: en && en.date !== s.date ? en.date : null,
            endTime: en?.time,
            venueName: v.Name ?? 'TBA',
            venueAddress: [v.Address, v.Locality, [v.State, v.Postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null,
            genres: [...(e.Categories ?? []), ...(e.Bands?.length ? ['Music'] : [])],
            price: from > 0 ? `From $${Math.round(from)}` : null,
            imageUrl: e.EventImage1 ? String(e.EventImage1).replace(/\?.*$/, '?width=1200&height=600') : null,
            ticketUrl: e.EventUrl ? String(e.EventUrl).replace(/\?utm_[^#]*$/, '') : null,
            latitude: e._geoloc?.lat ?? null,
            longitude: e._geoloc?.lng ?? null,
            status,
            source: 'oztix',
            city: city.name,
          })
          if (ok) saved++
        } catch (err: any) {
          console.error(`[oztix] event error: ${err?.message}`)
        }
      }
      if ((r?.nbHits ?? 0) === 0 && w > 5) break
      await sleep(300)
    }
  }
  console.log(`[oztix] saved ${saved} events`)
  return saved
}

// ---------------- Ticketek (licensed partner / affiliate feed only, never the website) ----------------
// Ticketek has no public API and its site terms forbid automated access, so nothing is fetched until Outza
// holds a licence. Two licensed routes are supported:
//  1. impact.com affiliate catalog: IMPACT_ACCOUNT_SID + IMPACT_AUTH_TOKEN + IMPACT_TICKETEK_CATALOG_ID
//  2. Direct partner feed/API from Ticketek: TICKETEK_FEED_URL (JSON or CSV) + optional TICKETEK_FEED_AUTH
//     (full Authorization header value, e.g. "Bearer …").
// Images are only used when the licence allows it (TICKETEK_IMAGES_ALLOWED=1). Availability is never imported.

type Row = Record<string, unknown>

function field(row: Row, ...names: string[]): string | null {
  const keys = Object.keys(row)
  for (const n of names) {
    const k = keys.find((x) => x.toLowerCase().replace(/[^a-z0-9]/g, '') === n)
    const v = k ? row[k] : null
    if (v != null && typeof v !== 'object' && String(v).trim()) return String(v).trim()
  }
  return null
}

/** Local date/time for a feed value: naive "YYYY-MM-DD HH:MM" is already local; offsets/unix are converted. */
function localParts(v: string | null, tz: string): { date: string; time: string | null } | null {
  if (!v) return null
  const naive = v.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?(?::\d{2}(?:\.\d+)?)?$/)
  if (naive) return { date: naive[1], time: naive[2] ?? null }
  const au = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/)
  if (au) return { date: `${au[3]}-${au[2].padStart(2, '0')}-${au[1].padStart(2, '0')}`, time: au[4] ? `${au[4].padStart(2, '0')}:${au[5]}` : null }
  const d = /^\d{9,13}$/.test(v) ? new Date(Number(v) * (v.length > 10 ? 1 : 1000)) : new Date(v)
  return isNaN(d.getTime()) ? null : toSydneyParts(d, tz)
}

function parseCsv(text: string): Row[] {
  const rows: string[][] = []
  let cur: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') { cur.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      cur.push(cell); rows.push(cur); cur = []; cell = ''
    } else cell += c
  }
  if (cell || cur.length) { cur.push(cell); rows.push(cur) }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()))
  return head ? body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? '']))) : []
}

async function ticketekRows(): Promise<Row[] | null> {
  const sid = process.env.IMPACT_ACCOUNT_SID, token = process.env.IMPACT_AUTH_TOKEN, catalog = process.env.IMPACT_TICKETEK_CATALOG_ID
  if (sid && token && catalog) {
    const auth = `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`
    const rows: Row[] = []
    let next: string | null = `/Mediapartners/${sid}/Catalogs/${catalog}/Items?PageSize=1000`
    for (let n = 0; next && n < 50; n++) {
      const res: Response = await fetch(`https://api.impact.com${next}`, { headers: { Authorization: auth, Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(60000) })
      if (!res.ok) throw new Error(`impact.com catalog ${res.status}`)
      const j: any = await res.json()
      rows.push(...(j?.Items ?? []))
      next = j?.['@nextpageuri'] || null
      await sleep(500)
    }
    return rows
  }
  const url = process.env.TICKETEK_FEED_URL
  if (!url) return null
  const headers: Record<string, string> = { Accept: 'application/json, text/csv', 'User-Agent': UA }
  if (process.env.TICKETEK_FEED_AUTH) headers.Authorization = process.env.TICKETEK_FEED_AUTH
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(120000) })
  if (!res.ok) throw new Error(`Ticketek feed ${res.status}`)
  const text = await res.text()
  if (/^\s*[[{]/.test(text)) {
    const j = JSON.parse(text)
    return Array.isArray(j) ? j : j.items ?? j.Items ?? j.events ?? j.data ?? []
  }
  return parseCsv(text)
}

export async function fetchTicketekEvents(): Promise<number> {
  const rows = await ticketekRows()
  if (!rows) {
    console.log('[ticketek] no licensed feed configured, skipped')
    return 0
  }
  const images = process.env.TICKETEK_IMAGES_ALLOWED === '1'
  let saved = 0
  for (const r of rows) {
    try {
      const lat = Number(field(r, 'latitude', 'lat', 'venuelatitude')), lng = Number(field(r, 'longitude', 'lng', 'lon', 'venuelongitude'))
      const hasGeo = Number.isFinite(lat) && Number.isFinite(lng) && !!(lat || lng)
      const cityName = field(r, 'city', 'venuecity', 'locality')
      const city = cityFor(hasGeo ? lat : null, hasGeo ? lng : null, field(r, 'postcode', 'postalcode', 'venuepostcode', 'zip'))
        ?? CITIES.find((c) => !!cityName && c.name.toLowerCase() === cityName.toLowerCase()) ?? null
      const name = field(r, 'name', 'title', 'eventname', 'showname')
      if (!city || !name) continue
      const s = localParts(field(r, 'startdate', 'eventdate', 'startdatetime', 'datetime', 'performancedate', 'launchdate', 'date'), city.tz)
      if (!s) continue
      const en = localParts(field(r, 'enddate', 'enddatetime', 'expirationdate'), city.tz)
      const status = field(r, 'status', 'eventstatus')?.toLowerCase() ?? ''
      const price = Number(field(r, 'minprice', 'pricefrom', 'currentprice', 'price'))
      const ok = await saveEvent({
        title: title(name),
        description: field(r, 'description', 'summary', 'teaser'),
        date: s.date,
        time: s.time,
        endDate: en && en.date !== s.date ? en.date : null,
        endTime: en?.time ?? null,
        venueName: title(field(r, 'venuename', 'venue', 'location') ?? 'TBA'),
        venueAddress: field(r, 'venueaddress', 'address', 'streetaddress'),
        genres: [field(r, 'category', 'genre', 'subcategory')].filter((g): g is string => !!g),
        price: price > 0 ? `From $${Math.round(price)}` : null,
        imageUrl: images ? field(r, 'imageurl', 'image', 'eventimage') : null,
        ticketUrl: field(r, 'url', 'eventurl', 'producturl', 'link', 'deeplink'),
        latitude: hasGeo ? lat : null,
        longitude: hasGeo ? lng : null,
        status: /cancel/.test(status) ? 'CANCELLED' : /postpon/.test(status) ? 'POSTPONED' : /reschedul/.test(status) ? 'RESCHEDULED' : 'SCHEDULED',
        source: 'ticketek',
        city: city.name,
      })
      if (ok) saved++
    } catch (err: any) {
      console.error(`[ticketek] event error: ${err?.message}`)
    }
  }
  console.log(`[ticketek] saved ${saved} events`)
  return saved
}
