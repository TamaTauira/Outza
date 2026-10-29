import { CITIES, cityDef } from '@/lib/cities'

/** Straight-line travel estimates between itinerary stops (client-safe, no external calls). Always shown as approximate. */

export interface Point { lat: number; lng: number }

/** Same-city pins further apart than this are bad geocodes, not a real trip (Perth to Melbourne is ~2,700 km). */
export const SAME_CITY_MAX_KM = 80

export function distanceKm(a: Point, b: Point): number {
  const R = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export interface Leg { km: number; walkMin: number; driveMin: number; mode: 'walking' | 'driving'; recommendedMin: number }

/** Streets are never straight: a detour factor is applied, then typical urban speeds (walk 4.8 km/h, drive 28–45 km/h + 4 min to park). */
export function estimateLeg(a: Point, b: Point): Leg {
  const km = distanceKm(a, b)
  const walkMin = Math.max(1, Math.round(((km * 1.3) / 4.8) * 60))
  const driveKm = km * 1.35
  const driveMin = Math.max(3, Math.round((driveKm / (driveKm < 10 ? 28 : 45)) * 60 + 4))
  const mode = walkMin <= 30 ? 'walking' : 'driving'
  return { km, walkMin, driveMin, mode, recommendedMin: mode === 'walking' ? walkMin : driveMin }
}

export const fmtMin = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`)
export const fmtKm = (km: number) => (km < 1 ? `${Math.round(km * 1000 / 50) * 50} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`)

export const directionsUrl = (from: Point, to: Point, mode: string) =>
  `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=${mode}`

export interface TravelStop {
  lat?: number | null
  lng?: number | null
  venueName?: string | null
  place?: string | null
  suburb?: string | null
  city?: string | null
}

export function normalisePlace(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Same venue even when one pin was geocoded to the wrong city. */
export function sameVenue(a: TravelStop, b: TravelStop): boolean {
  const av = normalisePlace(a.venueName)
  const bv = normalisePlace(b.venueName)
  if (av.length >= 4 && bv.length >= 4 && (av === bv || av.includes(bv) || bv.includes(av))) return true
  const ap = normalisePlace(a.place)
  const bp = normalisePlace(b.place)
  if (ap.length >= 4 && bp.length >= 4 && ap === bp) return true
  return false
}

const cityName = (value: string | null | undefined) => (value ?? '').trim()

/** Coordinates that can belong to the named city. Missing city only checks Australia. */
export function coordsFitCity(lat: number, lng: number, city?: string | null): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat < -44.5 || lat > -9 || lng < 112 || lng > 154.5) return false
  const name = cityName(city)
  if (!name) return true
  const known = CITIES.some((c) => c.name.toLowerCase() === name.toLowerCase())
  if (!known) return true
  const centre = cityDef(name)
  return distanceKm({ lat, lng }, { lat: centre.lat, lng: centre.lng }) <= 150
}

/** Nearest catalogue city. Outside Australia returns null so "near me" does not guess. */
export function nearestCity(lat: number, lng: number): string | null {
  if (!coordsFitCity(lat, lng, null)) return null
  let best = ''
  let bestKm = Infinity
  for (const c of CITIES) {
    const km = distanceKm({ lat, lng }, { lat: c.lat, lng: c.lng })
    if (km < bestKm) { best = c.name; bestKm = km }
  }
  return best || null
}

export type PlannedLeg =
  | { kind: 'same' }
  | { kind: 'different-city'; fromCity: string; toCity: string }
  | { kind: 'unreliable' }
  | { kind: 'missing' }
  | { kind: 'trip'; leg: Leg }

/**
 * How to explain the hop between two stops.
 * Same venue is the same place. Different cities are not chained into a walk.
 * Same-city pins that are hundreds of kilometres apart are not trusted.
 */
export function planLeg(from: TravelStop, to: TravelStop): PlannedLeg {
  if (sameVenue(from, to)) return { kind: 'same' }
  const fromCity = cityName(from.city)
  const toCity = cityName(to.city)
  if (fromCity && toCity && fromCity.toLowerCase() !== toCity.toLowerCase()) {
    return { kind: 'different-city', fromCity, toCity }
  }
  const hasFrom = from.lat != null && from.lng != null && coordsFitCity(from.lat, from.lng, from.city)
  const hasTo = to.lat != null && to.lng != null && coordsFitCity(to.lat, to.lng, to.city)
  if (!hasFrom || !hasTo) {
    if (from.lat != null && to.lat != null && fromCity && toCity && fromCity.toLowerCase() === toCity.toLowerCase()) {
      return { kind: 'unreliable' }
    }
    return { kind: 'missing' }
  }
  const a = { lat: from.lat as number, lng: from.lng as number }
  const b = { lat: to.lat as number, lng: to.lng as number }
  const km = distanceKm(a, b)
  if (km < 0.05) return { kind: 'same' }
  const sameSuburb = normalisePlace(from.suburb) && normalisePlace(from.suburb) === normalisePlace(to.suburb)
  if ((fromCity || sameSuburb) && km > SAME_CITY_MAX_KM) return { kind: 'unreliable' }
  if (km > 400) return { kind: 'unreliable' }
  return { kind: 'trip', leg: estimateLeg(a, b) }
}
