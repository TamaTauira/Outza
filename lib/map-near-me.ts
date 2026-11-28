import { areaGroupFor } from '@/lib/categories'
import { knownCityDef } from '@/lib/cities'
import { distanceKm } from '@/lib/travel'

/**
 * "Near me" on the board map (owner rule, 2026-11-28): the map never requires
 * selecting an area. When the visitor has granted location permission it
 * centres on their own location and filters by distance instead of by
 * suburb; with permission off it falls back to the board's selected area and
 * merely offers to enable location. These helpers hold the pure decisions so
 * the component only wires browser APIs to them. Coordinates live in
 * component state only — nothing here persists or sends them anywhere.
 */

export interface LatLng {
  lat: number
  lng: number
}

/** The radius choices the map offers while Near me is on, in kilometres. */
export const NEAR_ME_RADII_KM = [2, 5, 10, 25] as const
export const DEFAULT_NEAR_ME_RADIUS_KM = 10

/** Straight-line distance from the visitor to one pin, or null when the pin has no usable coordinates. */
export function pinDistanceKm(pin: { latitude?: number | null; longitude?: number | null }, from: LatLng): number | null {
  if (pin.latitude == null || pin.longitude == null) return null
  if (!Number.isFinite(pin.latitude) || !Number.isFinite(pin.longitude)) return null
  return distanceKm({ lat: pin.latitude, lng: pin.longitude }, from)
}

/** The pins within `radiusKm` of the visitor, nearest first. Pins without coordinates never qualify. */
export function filterPinsWithinRadius<T extends { latitude?: number | null; longitude?: number | null }>(
  pins: readonly T[],
  from: LatLng,
  radiusKm: number,
): T[] {
  return pins
    .map((pin) => ({ pin, km: pinDistanceKm(pin, from) }))
    .filter((x): x is { pin: T; km: number } => x.km != null && x.km <= radiusKm)
    .sort((a, b) => a.km - b.km)
    .map((x) => x.pin)
}

export type GeolocationPermission = 'granted' | 'denied' | 'prompt' | null

/**
 * Whether the map may centre on the visitor on mount, with no tap first.
 * Only an existing grant qualifies. Where the Permissions API can report the
 * browser's answer it is authoritative: 'granted' locates, 'prompt' and
 * 'denied' do not (the map opens on the board's area and the Near Me button
 * offers location instead). Where the API cannot report it (null), the
 * stored in-app consent from a previous Near Me success decides.
 */
export function shouldAutoLocate(input: { storedConsent: string | null; permission: GeolocationPermission }): boolean {
  if (input.permission === 'granted') return true
  if (input.permission === 'denied' || input.permission === 'prompt') return false
  return input.storedConsent === 'granted'
}

/** The locate states the map's Near me control cycles through. */
export type LocateState = 'idle' | 'locating' | 'found' | 'denied' | 'unavailable'

/**
 * The locate state after the visitor jumps elsewhere (a city change or an
 * area selection) invalidates any in-flight locate: a locate that already
 * landed ('found') and one still waiting on the browser's answer
 * ('locating') both settle back to 'idle', so the Near Me button always
 * becomes tappable again — a dropped locate must never leave it spinning,
 * disabled, forever. States that already carry an outcome ('denied',
 * 'unavailable') and plain 'idle' are left exactly as they are.
 */
export function locateStateAfterInvalidation(current: LocateState): LocateState {
  return current === 'found' || current === 'locating' ? 'idle' : current
}

/**
 * The locate state after the browser answers a locate with an error, given
 * whether the visitor asked for it. A deliberate tap keeps the honest
 * outcome: a permission denial lands on 'denied' (the card explains that
 * location is off and how to turn it on), any other failure on
 * 'unavailable'. An unprompted mount auto-locate (silent) never owns an
 * outcome the visitor didn't ask for: denial and failure alike settle back
 * to 'idle', so the map simply opens on the board's selected area with
 * Near me offered — per the owner rule, permission being off must never
 * plaster a card on arrival.
 */
export function locateStateAfterError(input: { permissionDenied: boolean; silent: boolean }): LocateState {
  if (input.silent) return 'idle'
  return input.permissionDenied ? 'denied' : 'unavailable'
}

/**
 * Where selecting an area value should jump the map: the centre of the area
 * group it names on this board, or null for a plain suburb — those pins are
 * already filtered server-side and there is no stored centre to jump to.
 */
export function areaJumpTarget(city: string, value: string | null | undefined): LatLng | null {
  const group = areaGroupFor(city, value)
  if (!group?.centre) return null
  const def = knownCityDef(group.centre)
  return { lat: def.lat, lng: def.lng }
}
