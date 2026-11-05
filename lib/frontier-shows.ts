/**
 * Frontier publishes one MusicEvent per tour date in the homepage JSON-LD.
 * The page URL is the tour, so the date has to travel with the source id.
 * The city comes from the place: a city word, the postal address, or a venue alias
 * when the location name is only the room ("Afterpay Arena, Formerly known as Qudos Bank Arena |").
 */
import { cityFromPlace, type PlaceCityInput } from '@/lib/venue-city'

export type FrontierShow = {
  title: string
  description: string | null
  imageUrl: string | null
  organiserUrl: string | null
  date: string
  time: string | null
  city: string
  venueName: string
  venueAddress: string
  url: string
  externalId: string
}

export function frontierExternalId(url: string, date: string): string | null {
  try {
    const path = new URL(url).pathname.replace(/^\/+|\/+$/g, '')
    if (!path || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
    return `${path}|${date}`
  } catch {
    return null
  }
}

function when(start: string): { date: string; time: string | null } | null {
  const date = start.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const clock = start.match(/T(\d{2}):(\d{2})/)
  if (!clock || clock[1] === '00' && clock[2] === '00') return { date, time: null }
  return { date, time: `${clock[1]}:${clock[2]}` }
}

function text(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed || /^null$/i.test(trimmed)) return ''
  return trimmed
}

function isEvent(item: { '@type'?: unknown }): boolean {
  const raw = item?.['@type']
  const list = Array.isArray(raw) ? raw : [raw]
  return list.some((type) => typeof type === 'string' && /Event$/.test(type))
}

function coord(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

type ReadPlace = PlaceCityInput & { venueName: string; venueAddress: string }

function addressRecord(address: unknown): Record<string, unknown> | null {
  if (Array.isArray(address)) {
    const record = address.find((item) => item && typeof item === 'object' && !Array.isArray(item))
    return record && typeof record === 'object' ? record as Record<string, unknown> : null
  }
  if (address && typeof address === 'object') return address as Record<string, unknown>
  return null
}

function readPlace(location: unknown): ReadPlace | null {
  if (typeof location === 'string') {
    const name = text(location)
    if (!name) return null
    return { name, venueName: name, venueAddress: name }
  }
  if (!location || typeof location !== 'object' || Array.isArray(location)) return null
  const place = location as Record<string, unknown>
  const address = place.address
  const postal = addressRecord(address)
  const street = text(postal?.streetAddress)
  const locality = text(postal?.addressLocality) || text(place.addressLocality)
  const region = text(postal?.addressRegion) || text(place.addressRegion)
  const postcode = text(postal?.postalCode ?? postal?.postcode) || text(place.postalCode)
  const joined = [street, locality, [region, postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const stringLine = typeof address === 'string'
    ? text(address)
    : Array.isArray(address) ? address.map(text).filter(Boolean).join(', ') : ''
  const addressLine = joined || stringLine
  const geo = place.geo && typeof place.geo === 'object' ? place.geo as Record<string, unknown> : null
  const name = text(place.name).replace(/[\s|]+$/g, '').trim()
  const venueAddress = addressLine || name
  if (!name && !addressLine && !locality && !postcode && !geo) return null
  return {
    name,
    address: addressLine,
    locality,
    region,
    postcode,
    lat: coord(geo?.latitude ?? geo?.lat ?? place.latitude),
    lng: coord(geo?.longitude ?? geo?.lng ?? place.longitude),
    venueName: name || venueAddress,
    venueAddress,
  }
}

function cleanVenueName(name: string, cityName: string): string {
  let label = name.replace(/\s+/g, ' ').trim()
  label = label.replace(/[\s|]+$/g, '').trim()
  label = label.replace(/,?\s+formerly known as\b.*$/i, '').trim()
  const city = cityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  label = label.replace(new RegExp(`,\\s*${city}\\s*$`, 'i'), '').trim()
  label = label.replace(/[\s,|]+$/g, '').trim()
  return label
}

function placesOf(location: unknown): unknown[] {
  if (Array.isArray(location)) return location
  if (location == null) return []
  return [location]
}

export function frontierShowsFromHtml(html: string): FrontierShow[] {
  const shows: FrontierShow[] = []
  const blocks = html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)
  for (const block of blocks) {
    let items: any[] = []
    try {
      const parsed = JSON.parse(block[1])
      items = Array.isArray(parsed) ? parsed : parsed?.['@graph'] ?? [parsed]
    } catch {
      continue
    }
    for (const item of items) {
      if (!isEvent(item)) continue
      const places = placesOf(item?.location).map(readPlace).filter((place): place is ReadPlace => !!place)
      const filed = places.flatMap((place) => {
        const city = cityFromPlace(place)
        return city ? [{ place, city }] : []
      })
      const cities = new Set(filed.map((row) => row.city.name))
      if (cities.size !== 1) continue
      const hit = filed[0]
      if (!hit) continue
      const { place, city } = hit
      const start = when(String(item?.startDate ?? ''))
      const url = typeof item?.url === 'string' ? item.url.trim() : ''
      if (!city || !start || !url) continue
      const externalId = frontierExternalId(url, start.date)
      if (!externalId) continue
      const organiser = item?.organizer
      const organiserUrl = typeof organiser?.url === 'string' ? organiser.url : typeof organiser?.sameAs === 'string' ? organiser.sameAs : null
      const venueName = cleanVenueName(place.venueName, city.name)
      shows.push({
        title: String(item.name ?? '').replace(/\s+20\d\d$/, '').trim(),
        description: typeof item?.description === 'string' && item.description.trim() ? item.description.trim() : null,
        imageUrl: typeof item?.image === 'string' ? item.image : null,
        organiserUrl,
        date: start.date,
        time: start.time,
        city: city.name,
        venueName: venueName || 'TBA',
        venueAddress: place.venueAddress,
        url,
        externalId,
      })
    }
  }
  return shows
}
