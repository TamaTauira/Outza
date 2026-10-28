import { fetchHtml, saveEvent, sleep } from '@/lib/event-store'
import { CITIES, type CityDef } from '@/lib/cities'

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

function priceFromAvailability(t: any): string | null {
  if (!t) return null
  if (t.is_free) return 'Free'
  const min = parseFloat(t.minimum_ticket_price?.major_value)
  const max = parseFloat(t.maximum_ticket_price?.major_value)
  if (!Number.isFinite(min)) return null
  if (min === 0 && (!Number.isFinite(max) || max === 0)) return 'Free'
  return Number.isFinite(max) && max > min ? `$${Math.round(min)} - $${Math.round(max)}` : `$${Math.round(min)}`
}

/** Live ticket prices for a batch of Eventbrite event ids (best-effort). */
async function fetchPrices(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!ids.length) return out
  try {
    const url = `https://www.eventbrite.com.au/api/v3/destination/events/?event_ids=${ids.join(',')}&expand=ticket_availability&page_size=${ids.length}`
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', Accept: 'application/json' }, signal: AbortSignal.timeout(15000) })
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

async function scrapeListing(city: CityDef, path: string, maxPages: number, forceFree: boolean): Promise<number> {
  let saved = 0
  let pageCount = 1
  for (let page = 1; page <= Math.min(pageCount, maxPages); page++) {
    const html = await fetchHtml(`https://www.eventbrite.com.au/d/${city.eventbrite}/${path}/?page=${page}`)
    if (!html) break
    const data = parseServerData(html)
    const events = data?.search_data?.events
    const results: any[] = events?.results ?? []
    pageCount = events?.pagination?.page_count ?? 1
    if (results.length === 0) break

    const needPrice = results.filter((e) => !e?.ticket_availability && e?.id).map((e) => String(e.id))
    const prices = await fetchPrices(needPrice)

    for (const e of results) {
      try {
        if (e?.is_online_event) continue
        const status = e?.is_cancelled ? 'CANCELLED' : e?.ticket_availability?.is_sold_out ? 'SOLD_OUT' : 'SCHEDULED'
        const v = e?.primary_venue
        const genres = (e?.tags ?? [])
          .map((t: any) => t?.display_name)
          .filter(Boolean)
        const ok = await saveEvent({
          title: e?.name,
          description: e?.summary,
          date: e?.start_date,
          time: e?.start_time,
          endDate: e?.end_date,
          endTime: e?.end_time,
          venueName: v?.name ?? 'TBA',
          venueAddress: v?.address?.localized_address_display ?? null,
          genres,
          isFree: forceFree,
          price: priceFromAvailability(e?.ticket_availability) ?? prices.get(String(e?.id)) ?? null,
          imageUrl: e?.image?.original?.url ?? e?.image?.url ?? null,
          ticketUrl: e?.url ?? null,
          latitude: parseFloat(v?.address?.latitude) || null,
          longitude: parseFloat(v?.address?.longitude) || null,
          source: 'eventbrite',
          status,
          city: city.name,
        })
        if (ok) saved++
      } catch (err: any) {
        console.error(`[eventbrite] event error: ${err?.message}`)
      }
    }
    await sleep(2000)
  }
  return saved
}

export async function fetchEventbriteEvents(): Promise<number> {
  let total = 0
  for (const city of CITIES) {
    // Free listing first so those events get flagged as free
    const free = await scrapeListing(city, 'free--events', Math.max(3, Math.round(city.ebPages / 4)), true)
    const all = await scrapeListing(city, 'all-events', city.ebPages, false)
    console.log(`[eventbrite] ${city.name}: saved ${free + all} events`)
    total += free + all
  }
  return total
}
