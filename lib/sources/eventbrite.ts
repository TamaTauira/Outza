import { fetchHtml, saveEvent, sleep, toSydneyParts } from '@/lib/event-store'
import { noteSourceSaved, sourceFetchSignal, yieldIfBudget } from '@/lib/source-budget'
import { INGEST_CITIES, type CityDef } from '@/lib/cities'
import { firstListingUrl, joinOriginPath, usableUrl } from '@/lib/listing-link'
import { preferDescription } from '@/lib/description-text'
import { moneyNumber, priceFromAmounts, readPrice } from '@/lib/price'
import { distanceKm } from '@/lib/travel'
import { addressInTasmania, coordsInTasmania } from '@/lib/tas-retag'
import { INGEST_RADIUS_SLACK_KM, cityForIngest } from '@/lib/venue-city'

function parseServerData(html: string): any | null {
  const marker = 'window.__SERVER_DATA__ = '
  const i = html.indexOf(marker)
  if (i < 0) return null
  const rest = html.slice(i + marker.length)
  const end = rest.indexOf(';\n')
  try {
    return JSON.parse(end > 0 ? rest.slice(0, end) : rest)
  } catch {
    return null
  }
}

export function priceFromAvailability(t: any): string | null {
  if (!t) return null
  const min = moneyNumber(t.minimum_ticket_price ?? t.min_price)
  const max = moneyNumber(t.maximum_ticket_price ?? t.max_price)
  // A positive ticket price wins over is_free: an event with some free classes
  // and some paid ones is a mixed event, not a free one.
  if ((min != null && min > 0) || (max != null && max > 0)) {
    return priceFromAmounts(min, max, { fromOnly: min != null && max == null && min > 0 }).price
  }
  if (t.is_free) return 'Free'
  if (min == null && max == null) return readPrice(t.minimum_ticket_price?.display ?? t.minimum_ticket_price_display).price
  return priceFromAmounts(min, max, { fromOnly: min != null && max == null && min > 0 }).price
}

/** The stable source id the other externalId feeds already pass to saveEvent. */
export function eventbriteExternalId(e: { id?: unknown } | null | undefined): string | null {
  return e?.id != null && e.id !== '' ? String(e.id) : null
}

/**
 * Whether the free-events pass may mark this event free as a whole.
 * Appearing in the free listing only proves a free class exists; the pass may
 * set isFree only on positive evidence of free drawn from actual price data:
 * a $0 maximum, amounts present and all zero, or a resolved price that reads
 * wholly Free and was derived from amounts. The is_free flag alone is not
 * evidence — and neither is a 'Free' price string when the flag is the only
 * evidence in hand, because priceFromAvailability derives that string from
 * the flag itself; the flag cannot corroborate itself. No price evidence is
 * not evidence of free.
 */
export function freePassMayMarkFree(availability: any, price: string | null): boolean {
  const min = moneyNumber(availability?.minimum_ticket_price ?? availability?.min_price)
  const max = moneyNumber(availability?.maximum_ticket_price ?? availability?.max_price)
  // A paid class anywhere in the evidence — the availability amounts or the
  // resolved price — means this is not a wholly free event.
  if ((min != null && min > 0) || (max != null && max > 0)) return false
  const parsed = readPrice(price)
  if (parsed.max != null && parsed.max > 0) return false
  // Positive evidence from the amounts themselves: a $0 maximum, or amounts
  // present and every one of them zero.
  const amounts = [min, max].filter((n): n is number => n != null)
  if (amounts.length > 0 && amounts.every((n) => n === 0)) return true
  if (parsed.isFree) {
    // A wholly-Free resolved price counts only when it was derived from
    // actual price data. With no amounts in the availability and only the
    // is_free flag set, a 'Free' read is the flag restated, not corroboration.
    return !(availability != null && amounts.length === 0 && availability?.is_free === true)
  }
  return false
}

/** Live ticket prices for a batch of Eventbrite event ids (best-effort). */
async function fetchPrices(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!ids.length) return out
  try {
    const url = `https://www.eventbrite.com.au/api/v3/destination/events/?event_ids=${ids.join(',')}&expand=ticket_availability&page_size=${ids.length}`
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', Accept: 'application/json' }, signal: sourceFetchSignal(15000) })
    if (!res.ok) return out
    const json: any = await res.json()
    for (const ev of json?.events ?? []) {
      const p = priceFromAvailability(ev?.ticket_availability)
      if (ev?.id && p) out.set(String(ev.id), p)
    }
  } catch (err: any) {
    console.warn(`[eventbrite] price lookup failed: ${err?.message}`)
  }
  return out
}

const EB_DELAY_MS = 2000
/** The public listing stops adding rows at about this page even when object_count is higher (~20 per page). */
const EB_PAGE_WALL = 49
const EB_PAGE_SAFETY = 60
/**
 * How far the date walk runs. A Sydney listing still had events ~20 months out; a window after that was empty.
 * ~24 months leaves a margin without scanning years of nothing.
 */
const EB_HORIZON_DAYS = 730
const EB_WINDOW_DAYS = 31

function ymdUtc(ymd: string): number {
  return Date.parse(`${ymd}T00:00:00Z`)
}

function addDays(ymd: string, n: number): string {
  const d = new Date(ymdUtc(ymd))
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function spanDays(a: string, b: string): number {
  return Math.round((ymdUtc(b) - ymdUtc(a)) / 86400000)
}

interface ListingPage {
  results: any[]
  pageCount: number
  pageSize: number
  objectCount: number
}

async function fetchListingPage(city: CityDef, path: string, page: number, start: string, end: string): Promise<ListingPage | null> {
  const html = await fetchHtml(
    `https://www.eventbrite.com.au/d/${city.eventbrite}/${path}/?page=${page}&start_date=${start}&end_date=${end}`,
  )
  if (!html) return null
  const events = parseServerData(html)?.search_data?.events
  if (!events) return null
  const results: any[] = events.results ?? []
  const pag = events.pagination ?? {}
  return {
    results,
    pageCount: Number(pag.page_count) || 1,
    pageSize: Number(pag.page_size) || results.length || 20,
    objectCount: Number(pag.object_count ?? results.length) || 0,
  }
}

/** True when the listing is hiding rows behind its page wall. */
function listingTruncated(page: ListingPage): boolean {
  const size = page.pageSize || 20
  if (page.objectCount > page.pageCount * size) return true
  // page_count itself clamps near 49, so a full wall on a multi-day window is treated as incomplete.
  return page.pageCount >= EB_PAGE_WALL && page.results.length >= size
}

/** Keep a venue in the city it actually sits in. A Tasmanian address found on a Perth search is filed under Hobart. */
function filedCity(search: CityDef, lat: number, lng: number, address?: string | null): string | null {
  const has = Number.isFinite(lat) && Number.isFinite(lng) && !!(lat || lng)
  if (has && coordsInTasmania(lat, lng)) return 'Hobart'
  if (addressInTasmania(address) && (!has || distanceKm({ lat, lng }, search) > search.radiusKm + INGEST_RADIUS_SLACK_KM)) return 'Hobart'
  if (!has) return search.name
  return cityForIngest(lat, lng)?.name ?? null
}

async function storeResults(city: CityDef, results: any[], forceFree: boolean): Promise<number> {
  let saved = 0
  const needPrice = results.filter((e) => !e?.ticket_availability && e?.id).map((e) => String(e.id))
  const prices = await fetchPrices(needPrice)
  for (const e of results) {
    try {
      if (e?.is_online_event) continue
      const lat = parseFloat(e?.primary_venue?.address?.latitude)
      const lng = parseFloat(e?.primary_venue?.address?.longitude)
      const place = filedCity(city, lat, lng, e?.primary_venue?.address?.localized_address_display)
      if (!place) continue
      const status = e?.is_cancelled ? 'CANCELLED' : e?.ticket_availability?.is_sold_out ? 'SOLD_OUT' : 'SCHEDULED'
      const v = e?.primary_venue
      const genres = (e?.tags ?? []).map((t: any) => t?.display_name).filter(Boolean)
      const page = joinOriginPath('https://www.eventbrite.com.au', e?.url)
        ?? (e?.id ? usableUrl(`https://www.eventbrite.com.au/e/${e.id}`) : null)
      const organiser = firstListingUrl(e?.primary_organizer ?? e?.organizer, ['website_url', 'url', 'website'])
      const price = priceFromAvailability(e?.ticket_availability) ?? prices.get(String(e?.id)) ?? null
      const ok = await saveEvent({
        title: e?.name,
        description: preferDescription(e?.full_description, e?.summary),
        date: e?.start_date,
        time: e?.start_time,
        endDate: e?.end_date,
        endTime: e?.end_time,
        venueName: v?.name ?? 'TBA',
        venueAddress: v?.address?.localized_address_display ?? null,
        genres,
        isFree: forceFree && freePassMayMarkFree(e?.ticket_availability, price),
        price,
        imageUrl: e?.image?.original?.url ?? e?.image?.url ?? null,
        ticketUrl: page,
        sourceUrl: page,
        organiserUrl: organiser,
        latitude: parseFloat(v?.address?.latitude) || null,
        longitude: parseFloat(v?.address?.longitude) || null,
        source: 'eventbrite',
        externalId: eventbriteExternalId(e),
        status,
        city: place,
      })
      if (ok) saved++
    } catch (err: any) {
      console.error(`[eventbrite] event error: ${err?.message}`)
    }
  }
  return saved
}

/** One inclusive date window. Splits when the page wall would hide events; otherwise reads every returned page. */
async function scrapeWindow(city: CityDef, path: string, forceFree: boolean, start: string, end: string): Promise<number> {
  if (yieldIfBudget('date windows')) return 0
  const first = await fetchListingPage(city, path, 1, start, end)
  await sleep(EB_DELAY_MS)
  if (!first || first.results.length === 0) return 0
  if (listingTruncated(first) && start < end) {
    const leftEnd = addDays(start, Math.floor(spanDays(start, end) / 2))
    if (leftEnd >= start && leftEnd < end) {
      const left = await scrapeWindow(city, path, forceFree, start, leftEnd)
      const right = await scrapeWindow(city, path, forceFree, addDays(leftEnd, 1), end)
      return left + right
    }
  }
  if (listingTruncated(first)) {
    console.warn(`[eventbrite] ${city.name} ${path} ${start} still truncated (${first.objectCount} events); taking the pages the site returns`)
  }
  let saved = await storeResults(city, first.results, forceFree)
  const extra = first.pageCount >= EB_PAGE_WALL ? 1 : 0
  const last = Math.min(first.pageCount + extra, EB_PAGE_SAFETY)
  for (let page = 2; page <= last; page++) {
    if (yieldIfBudget('pages')) break
    const info = await fetchListingPage(city, path, page, start, end)
    await sleep(EB_DELAY_MS)
    if (!info || info.results.length === 0) break
    saved += await storeResults(city, info.results, forceFree)
    if (info.results.length < (info.pageSize || 20)) break
  }
  return saved
}

async function scrapeListing(city: CityDef, path: string, forceFree: boolean): Promise<number> {
  const today = toSydneyParts(new Date(), 'Australia/Sydney').date
  const horizon = addDays(today, EB_HORIZON_DAYS)
  let saved = 0
  for (let start = today; start <= horizon;) {
    if (yieldIfBudget('date windows')) break
    const windowEnd = addDays(start, EB_WINDOW_DAYS - 1)
    const end = windowEnd > horizon ? horizon : windowEnd
    saved += await scrapeWindow(city, path, forceFree, start, end)
    start = addDays(end, 1)
  }
  return saved
}

export async function fetchEventbriteEvents(): Promise<number> {
  let total = 0
  for (const city of INGEST_CITIES) {
    if (yieldIfBudget('cities')) break
    // All-events first. The free listing runs second so its isFree flag is what saveEvent keeps
    // when the same event is in both feeds (a same-source update overwrites isFree).
    const all = await scrapeListing(city, 'all-events', false)
    const free = await scrapeListing(city, 'free--events', true)
    console.log(`[eventbrite] ${city.name}: saved ${free + all} events`)
    total += free + all
    noteSourceSaved(total)
  }
  return total
}
