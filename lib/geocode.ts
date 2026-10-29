/** Australia-only address lookup. Photon first, Nominatim as backup. No API key. */

export type Geo = { lat: number; lng: number } | null

const cache = new Map<string, Geo>()

const inAu = (lat: number, lng: number) => lat > -44.5 && lat < -9 && lng > 112 && lng < 154.5

async function photon(q: string): Promise<Geo> {
  const res = await fetch(`https://photon.komoot.io/api/?limit=1&lang=en&bbox=112,-44.5,154.5,-9&q=${encodeURIComponent(q)}`, {
    headers: { 'User-Agent': 'Outza venue maps (events platform)' },
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) throw new Error(`Photon ${res.status}`)
  const c = (await res.json())?.features?.[0]?.geometry?.coordinates
  return Array.isArray(c) && inAu(Number(c[1]), Number(c[0])) ? { lat: Number(c[1]), lng: Number(c[0]) } : null
}

async function nominatim(q: string): Promise<Geo> {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=au&q=${encodeURIComponent(q)}`, {
    headers: { 'User-Agent': 'Outza itinerary (events platform)', 'Accept-Language': 'en-AU' },
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)
  const rows = await res.json()
  return rows?.[0] ? { lat: Number(rows[0].lat), lng: Number(rows[0].lon) } : null
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
