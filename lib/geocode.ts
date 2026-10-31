/** Australia-only address lookup. Photon first, Nominatim as backup. No API key. */

export type Geo = { lat: number; lng: number } | null

const cache = new Map<string, Geo>()

const inAu = (lat: number, lng: number) => lat > -44.5 && lat < -9 && lng > 112 && lng < 154.5

const OTHER_STATION = /\b(fire|police|ambulance)\b/i

/**
 * "Central Station, Glebe" must not land on Glebe Fire Station.
 * A query that names a station only accepts a hit that names that same station.
 */
export function geocodeNameFits(query: string, name: string | null | undefined): boolean {
  if (!name?.trim()) return true
  const asked = query.toLowerCase().match(/\b([a-z][a-z0-9'’.-]+(?:\s+[a-z][a-z0-9'’.-]+)?)\s+station\b/)
  if (!asked) return true
  const place = asked[1].trim()
  if (place.length < 4) return true
  const hit = name.toLowerCase()
  if (!hit.includes(place)) return false
  if (OTHER_STATION.test(hit) && !OTHER_STATION.test(query)) return false
  return true
}

function coordsOf(lat: unknown, lng: unknown): Geo {
  const a = Number(lat)
  const b = Number(lng)
  return Number.isFinite(a) && Number.isFinite(b) && inAu(a, b) ? { lat: a, lng: b } : null
}

async function photon(q: string): Promise<Geo> {
  const res = await fetch(`https://photon.komoot.io/api/?limit=5&lang=en&bbox=112,-44.5,154.5,-9&q=${encodeURIComponent(q)}`, {
    headers: { 'User-Agent': 'VibePeep venue maps (events platform)' },
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) throw new Error(`Photon ${res.status}`)
  const features = (await res.json())?.features
  if (!Array.isArray(features)) return null
  for (const feature of features) {
    const props = feature?.properties ?? {}
    const name = [props.name, props.street].filter(Boolean).join(' ')
    if (!geocodeNameFits(q, name)) continue
    const c = feature?.geometry?.coordinates
    const geo = Array.isArray(c) ? coordsOf(c[1], c[0]) : null
    if (geo) return geo
  }
  return null
}

async function nominatim(q: string): Promise<Geo> {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=au&q=${encodeURIComponent(q)}`, {
    headers: { 'User-Agent': 'VibePeep itinerary (events platform)', 'Accept-Language': 'en-AU' },
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)
  const rows = await res.json()
  if (!Array.isArray(rows)) return null
  for (const row of rows) {
    const name = [row?.name, row?.display_name].filter(Boolean).join(' ')
    if (!geocodeNameFits(q, name)) continue
    const geo = coordsOf(row?.lat, row?.lon)
    if (geo) return geo
  }
  return null
}

export function geocodeCached(q: string): boolean {
  return cache.has(q.toLowerCase().trim())
}

/** Photon first, Nominatim as backup. Only successful lookups are cached. */
export async function geocode(q: string): Promise<Geo> {
  const key = q.toLowerCase().trim()
  if (!key) return null
  if (cache.has(key)) return cache.get(key) ?? null
  for (const provider of [photon, nominatim]) {
    try {
      const geo = await provider(q)
      if (geo) { cache.set(key, geo); return geo }
    } catch (err) {
      console.error('Geocode failed:', err)
    }
  }
  return null
}

/** Drop the street and keep the last parts (suburb, city). */
export function simplifyQuery(q: string): string {
  const parts = q.split(',').map((p) => p.trim()).filter(Boolean)
  return parts.length > 2 ? parts.slice(-2).join(', ') : ''
}

/** One address, with the plan city appended when it is not already in the text. */
export async function locateAddress(query: string, city?: string | null): Promise<Geo> {
  const q = query.trim().slice(0, 200)
  if (!q) return null
  const full = city && !q.toLowerCase().includes(city.toLowerCase()) ? `${q}, ${city}` : q
  const first = await geocode(full)
  if (first) return first
  const short = simplifyQuery(full)
  if (!short) return null
  return geocode(short)
}
