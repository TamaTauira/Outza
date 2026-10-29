/**
 * Perth searches sometimes save a Tasmanian venue under Perth.
 * A match needs the venue itself to be in Tasmania (coordinates or a TAS address),
 * not a Perth match whose title merely names a Tasmanian team.
 */
import { distanceKm } from '@/lib/travel'

export const TASMANIA_BOX = { latMin: -43.8, latMax: -39.4, lngMin: 143.5, lngMax: 148.6 }

const TAS_ADDRESS = /,\s*TAS\b|\bTAS\s+\d{4}\b|\bTasmania\b/i

export function coordsInTasmania(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return false
  return lat >= TASMANIA_BOX.latMin && lat <= TASMANIA_BOX.latMax && lng >= TASMANIA_BOX.lngMin && lng <= TASMANIA_BOX.lngMax
}

export function addressInTasmania(address: string | null | undefined): boolean {
  return TAS_ADDRESS.test(address ?? '')
}

/** Hobart is the only Tasmanian city in the catalogue. Suburb keeps the town (Launceston, Burnie, …). */
export function perthMisfileToHobart(ev: {
  city?: string | null
  latitude?: number | null
  longitude?: number | null
  venueAddress?: string | null
}): boolean {
  if (ev.city !== 'Perth') return false
  if (coordsInTasmania(ev.latitude, ev.longitude)) return true
  // A Perth pin whose title says "Tasmania" (a visiting team) stays in Perth.
  if (ev.latitude != null && ev.longitude != null && distanceKm({ lat: ev.latitude, lng: ev.longitude }, { lat: -31.9523, lng: 115.8613 }) <= 80) return false
  return addressInTasmania(ev.venueAddress)
}
