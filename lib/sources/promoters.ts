import { fetchHtml, saveEvent, extractNextData, sleep, toSydneyParts } from '@/lib/event-store'
import { CITIES } from '@/lib/cities'
import { moneyNumber, priceFromAmounts, readPrice, readPriceRows } from '@/lib/price'

function offerList(raw: unknown): any[] {
  if (!raw) return []
  return Array.isArray(raw) ? raw : [raw]
}

/** Schema.org Offer / AggregateOffer on a Frontier date, when the page actually publishes one. */
function frontierPrice(it: any) {
  if (it?.isAccessibleForFree === true) return readPrice(null, true)
  const offers = [...offerList(it?.offers), ...offerList(it?.subEvent).flatMap((s) => offerList(s?.offers))]
  const nums: number[] = []
  for (const o of offers) {
    for (const k of ['lowPrice', 'highPrice', 'price', 'minPrice', 'maxPrice']) {
      const n = moneyNumber(o?.[k])
      if (n != null) nums.push(n)
    }
  }
  if (!nums.length) return readPrice(null)
  return priceFromAmounts(Math.min(...nums), Math.max(...nums))
}

function priceFromCosData(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (text.startsWith('[') || text.startsWith('{')) {
      try { return priceFromCosData(JSON.parse(text)) } catch { return readPrice(text).price }
    }
    return readPrice(text).price
  }
  if (Array.isArray(raw)) return readPriceRows(raw).price
  return readPrice(raw).price
}

const cosPriceCache = new Map<string, string | null>()

/** City of Sydney publishes priceData on the event page, not on the search hit. */
async function lookupCosPrice(h: any): Promise<string | null> {
  const direct = priceFromCosData(h.priceData ?? h.cost ?? h.price)
  if (direct) return direct
  if (h.freeEvent === 'true' || h.freeEvent === true) return null
  const slug = String(h.slug ?? '').replace(/^\/+|\/+$/g, '')
  if (!slug) return null
  if (cosPriceCache.has(slug)) return cosPriceCache.get(slug) ?? null
  const html = await fetchHtml(`${COS_ORIGIN}/events/${slug}`)
  const raw = (html ? extractNextData(html) : null)?.props?.pageProps?.eventData?.priceData
  const price = priceFromCosData(raw)
  cosPriceCache.set(slug, price)
  return price
}

/** Frontier Touring – schema.org MusicEvent JSON-LD for every tour date nationally. */
export async function fetchFrontierEvents(): Promise<number> {
  const html = await fetchHtml('https://www.frontiertouring.com/')
  if (!html) return 0
  let saved = 0
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  for (const b of blocks) {
    let items: any[] = []
    try {
      const d = JSON.parse(b[1])
      items = Array.isArray(d) ? d : d?.['@graph'] ?? [d]
    } catch {
      continue
    }
    for (const it of items) {
      const loc: string = it?.location?.name ?? ''
      const city = CITIES.find((c) => c.match.test(loc))
      if (!/Event$/.test(it?.['@type'] ?? '') || !city) continue
      const offer = frontierPrice(it)
      const ok = await saveEvent({
        title: String(it.name ?? '').replace(/\s+20\d\d$/, ''),
        description: it.description || `${it?.performer?.name ?? it.name} live in ${city.name}, presented by Frontier Touring.`,
        date: String(it.startDate ?? '').slice(0, 10),
        city: city.name,
        venueName: loc.replace(new RegExp(`,\\s*${city.name}$`, 'i'), ''),
        venueAddress: loc,
        genres: ['Music', 'Concert'],
        imageUrl: it.image ?? null,
        ticketUrl: it.url ?? null,
        price: offer.price,
        isFree: offer.isFree,
        source: 'frontier',
      }).catch(() => false)
      if (ok) saved++
    }
  }
  console.log(`[frontier] saved ${saved} events`)
  return saved
}

function parse12h(s: string): string | null {
  const m = s.trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)$/)
  if (!m) return null
  let h = parseInt(m[1]) % 12
  if (m[3] === 'pm') h += 12
  return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`
}

const COS_ORIGIN = 'https://whatson.cityofsydney.nsw.gov.au'
const COS_DELAY_MS = 1500
/**
 * The public search embeds at most 300 hits and ignores a page number.
 * A mid-2028 window came back empty; ~21 months covers the dates the index still lists (into late 2027).
 */
const COS_HORIZON_DAYS = 640
const COS_WINDOW_DAYS = 7

function cosAddDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function cosSpan(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
}

async function saveCosHit(h: any): Promise<boolean> {
  const [start, end] = String(h.eventUpcomingTime ?? '').split(/\s+to\s+/)
  const free = h.freeEvent === 'true' || h.freeEvent === true
  const price = free ? null : await lookupCosPrice(h)
  return saveEvent({
    title: h.name,
    description: h.strapline,
    date: h.upcomingDate ?? h.dates?.[0],
    time: start ? parse12h(start) : null,
    endTime: end ? parse12h(end) : null,
    venueName: h.venueName || h.suburbName || 'TBA',
    venueAddress: h.suburbName ? `${h.suburbName}, NSW` : null,
    genres: [...(h.categories ?? []), ...(h.tags ?? [])].map((t: string) => t.replace(/-/g, ' ')),
    isFree: free,
    price,
    imageUrl: h.tileImageCloudinary?.[0]?.secure_url ?? null,
    ticketUrl: `${COS_ORIGIN}/events/${h.slug}`,
    source: 'cityofsydney',
  }).catch(() => false)
}

/** City of Sydney "What's On" guide – homepage sections plus every date the public search will return. */
export async function fetchCityOfSydneyEvents(): Promise<number> {
  let saved = 0
  const seen = new Set<string>()
  const consider = async (hits: Iterable<any>) => {
    for (const h of hits) {
      const id = h?.objectID ? String(h.objectID) : ''
      if (id && seen.has(id)) continue
      if (id) seen.add(id)
      if (await saveCosHit(h)) saved++
    }
  }

  const home = await fetchHtml(`${COS_ORIGIN}/`)
  const homeData = home ? extractNextData(home) : null
  if (homeData) {
    const hits = new Map<string, any>()
    const walk = (o: any) => {
      if (Array.isArray(o)) o.forEach(walk)
      else if (o && typeof o === 'object') {
        if (o.type === 'Event' && o.objectID && Array.isArray(o.dates)) hits.set(o.objectID, o)
        Object.values(o).forEach(walk)
      }
    }
    walk(homeData?.props?.pageProps?.sectionAdditionalData)
    await consider(hits.values())
  }

  const search = async (start: string, end: string): Promise<{ hits: any[]; truncated: boolean } | null> => {
    const html = await fetchHtml(`${COS_ORIGIN}/?dates=${start},${end}`)
    const sr = (html ? extractNextData(html) : null)?.props?.pageProps?.searchResults
    await sleep(COS_DELAY_MS)
    if (!sr) return null
    const hits: any[] = sr.hits ?? []
    const nbHits = Number(sr.nbHits ?? hits.length)
    const nbPages = Number(sr.nbPages ?? (hits.length ? 1 : 0))
    return { hits, truncated: nbPages > 1 || nbHits > hits.length }
  }

  const ingest = async (start: string, end: string) => {
    const page = await search(start, end)
    if (!page) return
    if (page.truncated && start < end) {
      const leftEnd = cosAddDays(start, Math.floor(cosSpan(start, end) / 2))
      if (leftEnd >= start && leftEnd < end) {
        await ingest(start, leftEnd)
        await ingest(cosAddDays(leftEnd, 1), end)
        return
      }
    }
    if (page.truncated) console.warn(`[cityofsydney] ${start} still truncated at ${page.hits.length} hits`)
    await consider(page.hits)
  }

  const today = toSydneyParts(new Date(), 'Australia/Sydney').date
  const horizon = cosAddDays(today, COS_HORIZON_DAYS)
  for (let start = today; start <= horizon;) {
    const windowEnd = cosAddDays(start, COS_WINDOW_DAYS - 1)
    const end = windowEnd > horizon ? horizon : windowEnd
    await ingest(start, end)
    start = cosAddDays(end, 1)
  }

  console.log(`[cityofsydney] saved ${saved} events`)
  return saved
}

/** Humanitix – featured events per city. The public city page only embeds that featured set; it has no page parameter to follow. */
export async function fetchHumanitixEvents(): Promise<number> {
  let saved = 0
  for (const city of CITIES) for (const path of ['', '/music']) {
    const html = await fetchHtml(`https://humanitix.com/au/events/${city.humanitix}${path}`)
    const data = html ? extractNextData(html) : null
    const f = data?.props?.pageProps?.featuredCarouselEntries ?? {}
    const list: any[] = [...(f.carouselEntries ?? []), ...(f.verticalEvents ?? [])]
    for (const e of list) {
      const sd = e?.date?.startDate ? new Date(e.date.startDate) : null
      if (!sd || isNaN(sd.getTime())) continue
      const ed = e?.date?.endDate ? new Date(e.date.endDate) : null
      const s = toSydneyParts(sd, city.tz)
      const en = ed && !isNaN(ed.getTime()) ? toSydneyParts(ed, city.tz) : null
      const min = moneyNumber(e?.pricing?.minimumPrice ?? e?.pricing?.minPrice)
      const max = moneyNumber(e?.pricing?.maximumPrice ?? e?.pricing?.maxPrice)
      const priced = priceFromAmounts(min, max, { fromOnly: min != null && max == null && min > 0 })
      const ok = await saveEvent({
        title: e.name,
        description: e.description ?? e.summary ?? null,
        date: s.date,
        time: s.time,
        endDate: en?.date,
        endTime: en?.time,
        venueName: e?.eventLocation?.venueName ?? 'TBA',
        venueAddress: e?.eventLocation?.address ?? null,
        genres: [e?.category, e?.subcategory, path === '/music' ? 'Music' : ''].filter(Boolean),
        price: priced.price,
        isFree: priced.isFree,
        feesIncluded: e?.pricing?.plusBuyerFee === true ? false : e?.pricing?.plusBuyerFee === false ? true : null,
        imageUrl: e?.bannerImage?.handle ? `https://images.humanitix.com/i/${e.bannerImage.handle}@original` : null,
        ticketUrl: `${e.hostname ?? 'https://events.humanitix.com/'}${e.slug}`,
        source: 'humanitix',
        city: city.name,
      }).catch(() => false)
      if (ok) saved++
    }
  }
  console.log(`[humanitix] saved ${saved} events`)
  return saved
}
