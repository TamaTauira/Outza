import { fetchHtml, saveEvent, extractNextData, sleep, toSydneyParts } from '@/lib/event-store'
import { cityOfSydneyPlace } from '@/lib/cos-place'
import { cosDescriptionFromRecord, cosHitsFromHtml, cosPriceText, cosWhen } from '@/lib/cos-event'
import { cosDescriptionFromHtml, preferDescription } from '@/lib/description-text'
import { extractListingVenue } from '@/lib/listing-venue'
import { firstListingUrl, isTicketLink, usableUrl } from '@/lib/listing-link'
import { moneyNumber, priceFromAmounts, readPrice } from '@/lib/price'
import { noteSourceSaved, remainingBudgetMs, sourceFetchSignal, sourceOverBudget, yieldIfBudget } from '@/lib/source-budget'
import { frontierShowsFromHtml } from '@/lib/frontier-shows'

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

type CosDetail = {
  price: string | null
  description: string | null
  html: string | null
  isFree: boolean | null
  venueName: string | null
  address: string | null
  suburbName: string | null
  lat: number | null
  lng: number | null
  ticketingLink: string | null
  website: string | null
}

const cosPageCache = new Map<string, CosDetail>()

const EMPTY_COS: CosDetail = {
  price: null, description: null, html: null, isFree: null, venueName: null, address: null,
  suburbName: null, lat: null, lng: null, ticketingLink: null, website: null,
}

function cosNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

function detailFromRecord(record: Record<string, unknown>, html: string | null): CosDetail {
  const location = record.location && typeof record.location === 'object' ? record.location as Record<string, unknown> : null
  return {
    price: cosPriceText(record.prices ?? record.priceData ?? record.cost ?? record.price),
    description: cosDescriptionFromRecord(record),
    html,
    isFree: record.isFree === true || record.isFree === 'true' || record.freeEvent === true || record.freeEvent === 'true',
    venueName: typeof location?.venueName === 'string' ? location.venueName : null,
    address: typeof location?.address === 'string' ? location.address : null,
    suburbName: typeof location?.suburbName === 'string' ? location.suburbName : null,
    lat: cosNumber(location?.latitude ?? record.lat),
    lng: cosNumber(location?.longitude ?? record.lng),
    ticketingLink: typeof record.ticketingLink === 'string' ? record.ticketingLink : null,
    website: typeof record.website === 'string' ? record.website : null,
  }
}

/** The event record has the full description. Search hits only have the strapline. */
async function loadCosEventPage(slug: string): Promise<CosDetail> {
  const cached = cosPageCache.get(slug)
  if (cached) return cached
  if (sourceOverBudget() || remainingBudgetMs(20_000) < 8_000) return EMPTY_COS
  try {
    const res = await fetch(`${COS_ORIGIN}/api/v1/events/eventsearch/${encodeURIComponent(slug)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', Accept: 'application/json' },
      signal: sourceFetchSignal(15000),
    })
    if (res.ok) {
      const record = await res.json() as Record<string, unknown>
      const page = detailFromRecord(record, null)
      cosPageCache.set(slug, page)
      return page
    }
  } catch (err) {
    console.warn(`[cityofsydney] detail ${slug} failed: ${err instanceof Error ? err.message : err}`)
  }
  const html = await fetchHtml(`${COS_ORIGIN}/events/${slug}`)
  const next = (html ? extractNextData(html) : null)?.props?.pageProps?.eventData
  const fromHtml = html ? cosDescriptionFromHtml(html) : null
  const page = next && typeof next === 'object'
    ? { ...detailFromRecord(next as Record<string, unknown>, html), description: fromHtml ?? cosDescriptionFromRecord(next as Record<string, unknown>) }
    : { ...EMPTY_COS, html, description: fromHtml }
  cosPageCache.set(slug, page)
  return page
}

/** Frontier Touring – schema.org MusicEvent JSON-LD for every tour date nationally. */
export async function fetchFrontierEvents(): Promise<number> {
  const html = await fetchHtml('https://www.frontiertouring.com/')
  if (!html) return 0
  let saved = 0
  const offers = frontierOffers(html)
  for (const show of frontierShowsFromHtml(html)) {
    const offer = offers.get(`${show.externalId}`) ?? frontierPrice(null)
    const page = usableUrl(show.url)
    const ok = await saveEvent({
      title: show.title,
      description: show.description || `${show.title} live in ${show.city}, presented by Frontier Touring.`,
      date: show.date,
      time: show.time,
      city: show.city,
      venueName: show.venueName,
      venueAddress: show.venueAddress,
      genres: ['Music', 'Concert'],
      imageUrl: show.imageUrl,
      ticketUrl: page && isTicketLink(page, 'frontier', 'ticket') ? page : null,
      sourceUrl: page,
      organiserUrl: usableUrl(show.organiserUrl),
      price: offer.price,
      isFree: offer.isFree,
      source: 'frontier',
      externalId: show.externalId,
    }).catch(() => false)
    if (ok) saved++
  }
  console.log(`[frontier] saved ${saved} events`)
  return saved
}

/** Price still comes off the raw MusicEvent. The show list is the date and the venue. */
function frontierOffers(html: string): Map<string, ReturnType<typeof frontierPrice>> {
  const offers = new Map<string, ReturnType<typeof frontierPrice>>()
  for (const block of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let items: any[] = []
    try {
      const parsed = JSON.parse(block[1])
      items = Array.isArray(parsed) ? parsed : parsed?.['@graph'] ?? [parsed]
    } catch {
      continue
    }
    for (const item of items) {
      const date = String(item?.startDate ?? '').slice(0, 10)
      const url = typeof item?.url === 'string' ? item.url : ''
      let path = ''
      try { path = new URL(url).pathname.replace(/^\/+|\/+$/g, '') } catch { path = '' }
      if (!path || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      offers.set(`${path}|${date}`, frontierPrice(item))
    }
  }
  return offers
}

const COS_ORIGIN = 'https://whatson.cityofsydney.nsw.gov.au'
const COS_DELAY_MS = 1500
/**
 * The public search API pages. A mid-2028 window came back empty;
 * ~21 months covers the dates the index still lists (into late 2027).
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

function cosHitId(h: any): string {
  const id = h?.objectID ?? h?.objectId ?? h?.eventId
  return id != null && String(id).trim() ? String(id) : ''
}

function cosGenreNames(h: any): string[] {
  const raw = [...(h.categories ?? []), ...(h.tags ?? []), ...(h.vibes ?? [])]
  return raw.map((item: unknown) => {
    if (typeof item === 'string') return item.replace(/-/g, ' ')
    if (item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string') return (item as { name: string }).name
    return ''
  }).filter(Boolean)
}

async function saveCosHit(h: any): Promise<boolean> {
  if (yieldIfBudget('event pages')) return false
  const when = cosWhen(h)
  if (!when.date) return false
  const slug = String(h.slug ?? '').trim().replace(/^\/+|\/+$/g, '')
  const page = slug && !/^(undefined|null)$/i.test(slug) ? usableUrl(`${COS_ORIGIN}/events/${slug}`) : null
  const loaded = slug ? await loadCosEventPage(slug) : EMPTY_COS
  const listed = loaded.html && page ? extractListingVenue(loaded.html, page) : null
  const hitLocation = h.location && typeof h.location === 'object' ? h.location : null
  const place = cityOfSydneyPlace({
    listedAddress: listed?.address || loaded.address || hitLocation?.address || null,
    listedLat: listed?.lat ?? loaded.lat ?? (typeof hitLocation?.latitude === 'number' ? hitLocation.latitude : null),
    listedLng: listed?.lng ?? loaded.lng ?? (typeof hitLocation?.longitude === 'number' ? hitLocation.longitude : null),
    suburbName: loaded.suburbName || (typeof hitLocation?.suburbName === 'string' ? hitLocation.suburbName : null) || (typeof h.suburbName === 'string' ? h.suburbName : null),
  })
  const priced = loaded.price || cosPriceText(h.priceData ?? h.cost ?? h.price)
  const flaggedFree = h.freeEvent === 'true' || h.freeEvent === true || h.isFree === true || h.isFree === 'true' || loaded.isFree === true
  const free = flaggedFree && !priced
  const external = firstListingUrl(
    { ...h, website: h.website || loaded.website, ticketingLink: h.ticketingLink || loaded.ticketingLink },
    ['bookingUrl', 'bookingLink', 'ticketUrl', 'ticketLink', 'buyUrl', 'ticketingLink', 'externalUrl', 'website', 'websiteUrl'],
  )
  const ticket = external && isTicketLink(external, 'cityofsydney', 'ticket') ? external : null
  const image = h.tileImageCloudinary?.[0]?.secure_url
    ?? (typeof h.tileImage?.url === 'string' ? h.tileImage.url : null)
    ?? (typeof h.mainImage?.url === 'string' ? h.mainImage.url : null)
  return saveEvent({
    title: h.name,
    description: preferDescription(loaded.description, h.description, h.strapline),
    date: when.date,
    time: when.time,
    endDate: when.endDate,
    endTime: when.endTime,
    venueName: listed?.venueName || loaded.venueName || h.venueName || hitLocation?.venueName || h.suburbName || 'TBA',
    venueAddress: place.venueAddress,
    ...(place.lat != null && place.lng != null ? { latitude: place.lat, longitude: place.lng } : {}),
    genres: cosGenreNames(h),
    isFree: free,
    price: free ? null : priced,
    imageUrl: image,
    ticketUrl: ticket,
    sourceUrl: page ?? (external && external !== ticket ? external : null),
    organiserUrl: external && external !== page && external !== ticket ? external : null,
    source: 'cityofsydney',
    externalId: cosHitId(h) || null,
  }).catch(() => false)
}

/** City of Sydney "What's On" guide – homepage sections plus every date the public search will return. */
export async function fetchCityOfSydneyEvents(): Promise<number> {
  console.log('[cityofsydney] starting')
  let saved = 0
  const seen = new Set<string>()
  const consider = async (hits: Iterable<any>) => {
    for (const h of hits) {
      if (yieldIfBudget('search hits')) break
      const id = cosHitId(h)
      if (id && seen.has(id)) continue
      if (id) seen.add(id)
      if (await saveCosHit(h)) saved++
      noteSourceSaved(saved)
    }
  }

  const home = await fetchHtml(`${COS_ORIGIN}/`)
  if (home) await consider(cosHitsFromHtml(home))

  const search = async (start: string, end: string): Promise<{ hits: any[]; truncated: boolean } | null> => {
    const hits: any[] = []
    let total = 0
    const size = 100
    for (let pageNo = 1; pageNo <= 20; pageNo++) {
      if (yieldIfBudget('search pages')) break
      let json: { events?: any[]; totalResults?: number } | null = null
      try {
        const res = await fetch(
          `${COS_ORIGIN}/api/v1/events/eventsearch?pageNo=${pageNo}&resultsPerPage=${size}&isListingSearch=true&dates=${start},${end}`,
          {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', Accept: 'application/json' },
            signal: sourceFetchSignal(20000),
          },
        )
        if (res.ok) json = await res.json()
      } catch (err) {
        console.warn(`[cityofsydney] search ${start} failed: ${err instanceof Error ? err.message : err}`)
      }
      await sleep(COS_DELAY_MS)
      if (!json) {
        if (pageNo > 1) break
        const html = await fetchHtml(`${COS_ORIGIN}/?dates=${start},${end}`)
        const embedded = html ? cosHitsFromHtml(html) : []
        return embedded.length ? { hits: embedded, truncated: embedded.length >= 300 } : null
      }
      const batch: any[] = json.events ?? []
      total = Number(json.totalResults ?? hits.length + batch.length)
      hits.push(...batch)
      if (!batch.length || hits.length >= total || batch.length < size) break
    }
    if (!hits.length && !total) return null
    return { hits, truncated: total > hits.length }
  }

  const ingest = async (start: string, end: string) => {
    if (yieldIfBudget('date windows')) return
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
  let windows = 0
  for (let start = today; start <= horizon;) {
    if (yieldIfBudget('date windows')) break
    windows++
    if (windows === 1 || windows % 10 === 0) console.log(`[cityofsydney] window ${start} (${windows}, saved ${saved})`)
    const windowEnd = cosAddDays(start, COS_WINDOW_DAYS - 1)
    const end = windowEnd > horizon ? horizon : windowEnd
    await ingest(start, end)
    noteSourceSaved(saved)
    start = cosAddDays(end, 1)
  }

  console.log(`[cityofsydney] saved ${saved} events`)
  return saved
}

export { fetchHumanitixEvents } from '@/lib/sources/humanitix'
