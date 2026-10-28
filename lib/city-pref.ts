import { CITIES } from '@/lib/cities'

/** Shared with the home board so /local and the board open on the same city. */
export const CITY_KEY = 'se-city-v1'

export function readCity(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const c = localStorage.getItem(CITY_KEY)
    if (c === '') return ''
    if (c && CITIES.some((x) => x.name === c)) return c
  } catch {}
  return null
}

export function writeCity(city: string) {
  try { localStorage.setItem(CITY_KEY, city) } catch {}
}
