/** Straight-line travel estimates between itinerary stops (client-safe, no external calls). Always shown as approximate. */

export interface Point { lat: number; lng: number }

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
