import { saveEvent, sleep } from '@/lib/event-store'
import { usableUrl } from '@/lib/listing-link'
import { moneyNumber, priceFromAmounts } from '@/lib/price'
import { CITIES, type CityDef } from '@/lib/cities'
import { addressInOtherState } from '@/lib/seo'
import { distanceKm } from '@/lib/travel'
import { coordsInTasmania } from '@/lib/tas-retag'

const TM_PAGE_SIZE = 200
/** Discovery rejects page * size >= 1000, so five pages is the most one query can return. */
const TM_MAX_PAGES = 5
const TM_WINDOW_MS = 90 * 24 * 3600 * 1000
const TM_MIN_WINDOW_MS = 24 * 3600 * 1000
/** If the furthest-event probe fails, still walk this far (~24 months). */
const TM_HORIZON_DEFAULT_MS = 730 * 24 * 3600 * 1000
/** Hard stop so a bad far-future date cannot walk for years (~36 months). */
const TM_HORIZON_CAP_MS = 36 * 30 * 24 * 3600 * 1000

function tmStamp(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function cityUrl(city: CityDef, apiKey: string, extra: string): string {
  const area = `latlong=${city.lat},${city.lng}&radius=${city.radiusKm}&unit=km&countryCode=AU`
  return `https://app.ticketmaster.com/discovery/v2/events.json?${area}&size=${TM_PAGE_SIZE}&${extra}&apikey=${apiKey}`
}

async function tmJson(url: string, label: string): Promise<any | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!res.ok) {
      console.error(`Ticketmaster ${label} returned ${res.status}`)
      return null
    }
    return await res.json()
  } catch (err: any) {
    console.error(`Ticketmaster ${label} failed: ${err?.message}`)
    return null
  }
}

export async function fetchTicketmasterEvents(): Promise<number> {
  const apiKey = process.env.TICKETMASTER_API_KEY
  if (!apiKey) {
    console.error('TICKETMASTER_API_KEY not set')
    return 0
  }
  let total = 0
  for (const city of CITIES) {
    total += await fetchCity(city, apiKey)
  }
  console.log(`Ticketmaster: added/updated ${total} events across Australia`)
  return total
}

/** End of the range this city actually lists, capped so a junk date cannot run away. */
async function horizonEnd(city: CityDef, apiKey: string): Promise<Date> {
  const now = new Date()
  const cap = new Date(now.getTime() + TM_HORIZON_CAP_MS)
  const fallback = new Date(Math.min(now.getTime() + TM_HORIZON_DEFAULT_MS, cap.getTime()))
  const data = await tmJson(
    cityUrl(city, apiKey, `page=0&sort=date,desc&startDateTime=${tmStamp(now)}`),
    `${city.name} horizon`,
  )
  await sleep(300)
  const ev = data?._embedded?.events?.[0]
  const local = ev?.dates?.start?.localDate
  let furthest: Date | null = null
  if (typeof local === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(local)) {
    furthest = new Date(`${local}T00:00:00.000Z`)
    furthest.setUTCDate(furthest.getUTCDate() + 2)
  } else if (ev?.dates?.start?.dateTime) {
    const d = new Date(ev.dates.start.dateTime)
    if (!isNaN(d.getTime())) furthest = new Date(d.getTime() + 2 * 86400000)
  }
  if (!furthest || isNaN(furthest.getTime()) || furthest < now) return fallback
  return furthest > cap ? cap : furthest
}

async function fetchCity(city: CityDef, apiKey: string): Promise<number> {
  const horizon = await horizonEnd(city, apiKey)
  let saved = 0
  let cursor = new Date()
  while (cursor < horizon) {
    const end = new Date(Math.min(horizon.getTime(), cursor.getTime() + TM_WINDOW_MS))
    saved += await fetchWindow(city, apiKey, cursor, end)
    cursor = end
  }
  console.log(`Ticketmaster ${city.name}: added/updated ${saved} events`)
  return saved
}

/**
 * One [start, end) slice. Discovery only returns 1,000 rows per query, so a slice that
 * reports that many (or more) is halved until it fits, down to a single day.
 */
async function fetchWindow(city: CityDef, apiKey: string, start: Date, end: Date): Promise<number> {
  if (end.getTime() - start.getTime() < 1000) return 0
  const range = `startDateTime=${tmStamp(start)}&endDateTime=${tmStamp(end)}`
  const first = await tmJson(cityUrl(city, apiKey, `page=0&sort=date,asc&${range}`), `${city.name} ${tmStamp(start)}`)
  await sleep(300)
  if (!first) return 0
  const events: any[] = first?._embedded?.events ?? []
  if (events.length === 0) return 0
  const total = Number(first?.page?.totalElements ?? events.length)
  const totalPages = Number(first?.page?.totalPages ?? 1)
  const span = end.getTime() - start.getTime()
  const saturated = total >= TM_PAGE_SIZE * TM_MAX_PAGES || totalPages > TM_MAX_PAGES
  if (saturated && span > TM_MIN_WINDOW_MS) {
    const mid = new Date(start.getTime() + Math.floor(span / 2))
    const left = await fetchWindow(city, apiKey, start, mid)
    const right = await fetchWindow(city, apiKey, mid, end)
    return left + right
  }
  if (saturated) {
    console.warn(`[ticketmaster] ${city.name} one-day window still over the 1000-result cap (${total}); taking the first ${TM_PAGE_SIZE * TM_MAX_PAGES}`)
  }
  let saved = await saveTmEvents(events, city)
  const pages = Math.min(TM_MAX_PAGES, Math.max(totalPages, 1))
  for (let page = 1; page < pages; page++) {
    const data = await tmJson(cityUrl(city, apiKey, `page=${page}&sort=date,asc&${range}`), `${city.name} page ${page}`)
    await sleep(300)
    const more: any[] = data?._embedded?.events ?? []
    if (!data || more.length === 0) break
    saved += await saveTmEvents(more, city)
    if (more.length < TM_PAGE_SIZE) break
  }
  return saved
}

async function saveTmEvents(events: any[], city: CityDef): Promise<number> {
  let saved = 0
  for (const ev of events) {
    try {
      const venue = ev?._embedded?.venues?.[0]
      const genres: string[] = []
      for (const c of ev?.classifications ?? []) {
        for (const k of ['segment', 'genre', 'subGenre']) {
          const n = c?.[k]?.name
          if (n && n !== 'Undefined') genres.push(n)
        }
      }
      const ranges: any[] = ev?.priceRanges ?? []
      const pr = ranges.find((r) => /including fees/i.test(r?.type ?? '')) ?? ranges[0]
      const code = String(ev?.dates?.status?.code ?? '').toLowerCase()
      const status = code === 'cancelled' || code === 'canceled' ? 'CANCELLED' : code === 'postponed' ? 'POSTPONED' : code === 'rescheduled' ? 'RESCHEDULED' : 'SCHEDULED'
      const min = pr ? moneyNumber(pr.min) : null
      const max = pr ? moneyNumber(pr.max) : null
      const price = pr ? priceFromAmounts(min, max, { fromOnly: min != null && max == null && min > 0 }).price : null
      const images: any[] = ev?.images ?? []
      // Highest-resolution artwork, never a thumbnail (largest 16:9 first - stable URL across refreshes)
      const usable = images.filter((i) => i?.url && !i?.fallback)
      const widest = (list: any[]) => [...list].sort((a, b) => (b?.width ?? 0) - (a?.width ?? 0))[0]?.url
      const imageUrl = widest(usable.filter((i) => i?.ratio === '16_9')) ?? widest(usable) ?? images[0]?.url ?? null
      const venueCity = venue?.city?.name ?? city.name
      const lat = parseFloat(venue?.location?.latitude ?? '')
      const lng = parseFloat(venue?.location?.longitude ?? '')
      const hasPin = Number.isFinite(lat) && Number.isFinite(lng) && !!(lat || lng)
      const stateBits = [venue?.state?.name, venue?.state?.stateCode, venue?.address?.line1, venueCity].filter(Boolean).join(' ')
      let filed = city
      if (hasPin && coordsInTasmania(lat, lng)) filed = CITIES.find((c) => c.name === 'Hobart') ?? city
      else if (addressInOtherState(stateBits, city)) continue
      else if (hasPin && distanceKm({ lat, lng }, { lat: city.lat, lng: city.lng }) > city.radiusKm + 40) continue
      // Gallery: distinct artworks only (TM serves one artwork in many sizes - keep the widest of each)
      const attractionImages: any[] = (ev?._embedded?.attractions ?? []).flatMap((a: any) => a?.images ?? [])
      const byArtwork = new Map<string, { url: string; width: number }>()
      for (const im of [...usable, ...attractionImages.filter((i) => i?.url && !i?.fallback)]) {
        const base = String(im.url).replace(/_(RETINA|TABLET|EVENT|RECOMENDATION|ARTIST|CUSTOM|SOURCE|PORTRAIT|LANDSCAPE)[^/]*$/i, '').replace(/\?.*$/, '')
        const prev = byArtwork.get(base)
        if (!prev || (im.width ?? 0) > prev.width) byArtwork.set(base, { url: im.url, width: im.width ?? 0 })
      }
      const galleryUrls = [...byArtwork.values()].map((v) => v.url).filter((u) => u !== imageUrl)
      const promoterName: string | null = ev?.promoter?.name ?? ev?.promoters?.[0]?.name ?? null
      const page = usableUrl(ev?.url) ?? (ev?.id ? usableUrl(`https://www.ticketmaster.com.au/event/${encodeURIComponent(String(ev.id))}`) : null)
      const organiserPage = usableUrl(ev?._embedded?.attractions?.[0]?.externalLinks?.homepage?.[0]?.url)
      const ok = await saveEvent({
        title: ev?.name ?? 'Untitled Event',
        description: ev?.info ?? ev?.pleaseNote ?? '',
        date: ev?.dates?.start?.localDate ?? '',
        time: ev?.dates?.start?.timeTBA || ev?.dates?.start?.noSpecificTime ? null : ev?.dates?.start?.localTime,
        endDate: ev?.dates?.end?.localDate ?? null,
        endTime: ev?.dates?.end?.localTime ?? null,
        venueName: venue?.name ?? 'TBA',
        venueAddress: `${venue?.address?.line1 ?? ''}, ${venueCity}`.replace(/^, /, ''),
        genres,
        price,
        imageUrl,
        ticketUrl: page,
        sourceUrl: page,
        organiserUrl: organiserPage,
        latitude: hasPin ? lat : null,
        longitude: hasPin ? lng : null,
        source: 'ticketmaster',
        status,
        feesIncluded: pr ? /including fees/i.test(pr?.type ?? '') : null,
        city: filed.name,
        galleryUrls,
        accessibilityInfo: ev?.accessibility?.info ?? venue?.accessibleSeatingDetail ?? null,
        ageRestriction: ev?.ageRestrictions?.legalAgeEnforced ? '18+ (legal age enforced)' : null,
        organiserName: promoterName && !/^promoter$/i.test(promoterName) ? promoterName : null,
      })
      if (ok) saved++
    } catch (evErr: any) {
      console.error(`Error processing TM event: ${evErr?.message}`)
    }
  }
  return saved
}
