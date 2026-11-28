import { CITY_NAMES, DEFAULT_CITY } from '@/lib/cities'

/** Shared with the home board so /local and the board open on the same city. */
export const CITY_KEY = 'se-city-v1'

const known = (city: string | null | undefined) => {
  if (city === '') return ''
  if (city && CITY_NAMES.includes(city)) return city
  return null
}

export function readCity(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return known(localStorage.getItem(CITY_KEY))
  } catch {}
  return null
}

export function writeCity(city: string) {
  try { localStorage.setItem(CITY_KEY, city) } catch {}
}

export function userCityKey(userId: string): string {
  return `${CITY_KEY}:user:${userId}`
}

export function readUserCity(userId: string | null | undefined): string | null {
  if (!userId || typeof window === 'undefined') return null
  try { return known(localStorage.getItem(userCityKey(userId))) } catch {}
  return null
}

export function writeUserCity(userId: string | null | undefined, city: string) {
  if (!userId) return
  try { localStorage.setItem(userCityKey(userId), city) } catch {}
}

const chosen = (city: string | null | undefined): string | undefined => {
  if (city === '') return ''
  if (city && CITY_NAMES.includes(city)) return city
  return undefined
}

/**
 * Which city the board opens on.
 * A URL wins. A signed-in person's own pick wins, then the pick stored on
 * this device, then their account home city. The device pick outranks the
 * home city: it is the most recent explicit choice made on this device —
 * often this same person's, made before they signed in, or on /local,
 * which writes only the device key. The first version of this resolution
 * never read the device pick for a signed-in person, and the caller then
 * wrote a fallback (the edge IP default, or the home city) back over it,
 * destroying the pick (E2E-13 fix-up).
 * Empty string means All of Australia and is a real choice.
 */
export function resolveBoardCity(input: {
  urlCity?: string | null
  userCity?: string | null
  homeCity?: string | null
  guestCity?: string | null
  signedIn: boolean
}): string {
  const url = chosen(input.urlCity)
  if (url !== undefined) return url
  if (input.signedIn) {
    const own = chosen(input.userCity)
    if (own !== undefined) return own
    const device = chosen(input.guestCity)
    if (device !== undefined) return device
    const home = chosen(input.homeCity)
    if (home) return home
    return DEFAULT_CITY
  }
  const guest = chosen(input.guestCity)
  if (guest !== undefined) return guest
  return DEFAULT_CITY
}

/**
 * True when data a surface is holding was loaded for a different city than
 * the one now selected, so it must not be presented under the selected
 * city's name — the surface shows its loading state until its own fetch
 * for the selected city lands. `dataCity` is the city the held data was
 * loaded for (null when the surface has not recorded one); `held` is how
 * much data is being held (rows, a total, or both). An empty hand is never
 * stale, and '' is a real selection (All of Australia) on both sides.
 */
export function cityDataIsStale(dataCity: string | null, city: string | null | undefined, held: number): boolean {
  return held > 0 && dataCity !== (city ?? '')
}
