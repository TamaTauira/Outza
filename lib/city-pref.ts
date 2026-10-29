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
 * A URL wins. A signed-in person's own pick wins, then their account home city.
 * Another person's device city is not used once someone is signed in.
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
    const home = chosen(input.homeCity)
    if (home) return home
    return DEFAULT_CITY
  }
  const guest = chosen(input.guestCity)
  if (guest !== undefined) return guest
  return DEFAULT_CITY
}
