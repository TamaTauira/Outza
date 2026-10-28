export interface CityDef {
  name: string
  state: string
  lat: number
  lng: number
  tz: string
  radiusKm: number
  eventbrite: string
  humanitix: string
  /** Matches venue/location text from national feeds (e.g. Frontier Touring) */
  match: RegExp
  /** Traditional Custodians of the land the city sits on */
  custodians: string
}

export const CITIES: CityDef[] = [
  { name: 'Sydney', state: 'NSW', lat: -33.8688, lng: 151.2093, tz: 'Australia/Sydney', radiusKm: 60, eventbrite: 'australia--sydney', humanitix: 'au--nsw--sydney', match: /sydney/i, custodians: 'Gadigal people of the Eora Nation' },
  { name: 'Melbourne', state: 'VIC', lat: -37.8136, lng: 144.9631, tz: 'Australia/Melbourne', radiusKm: 50, eventbrite: 'australia--melbourne', humanitix: 'au--vic--melbourne', match: /melbourne|naarm/i, custodians: 'Wurundjeri Woi-wurrung and Bunurong peoples of the Kulin Nation' },
  { name: 'Brisbane', state: 'QLD', lat: -27.4698, lng: 153.0251, tz: 'Australia/Brisbane', radiusKm: 40, eventbrite: 'australia--brisbane', humanitix: 'au--qld--brisbane', match: /brisbane|meanjin/i, custodians: 'Turrbal and Yuggera peoples' },
  { name: 'Gold Coast', state: 'QLD', lat: -28.0167, lng: 153.4, tz: 'Australia/Brisbane', radiusKm: 35, eventbrite: 'australia--gold-coast', humanitix: 'au--qld--gold-coast', match: /gold coast|surfers paradise|southport|broadbeach/i, custodians: 'Yugambeh language peoples, including the Kombumerri' },
  { name: 'Perth', state: 'WA', lat: -31.9523, lng: 115.8613, tz: 'Australia/Perth', radiusKm: 50, eventbrite: 'australia--perth', humanitix: 'au--wa--perth', match: /perth|boorloo|fremantle/i, custodians: 'Whadjuk Noongar people' },
  { name: 'Adelaide', state: 'SA', lat: -34.9285, lng: 138.6007, tz: 'Australia/Adelaide', radiusKm: 40, eventbrite: 'australia--adelaide', humanitix: 'au--sa--adelaide', match: /adelaide|tarntanya/i, custodians: 'Kaurna people' },
  { name: 'Canberra', state: 'ACT', lat: -35.2809, lng: 149.13, tz: 'Australia/Sydney', radiusKm: 35, eventbrite: 'australia--canberra', humanitix: 'au--act--canberra', match: /canberra/i, custodians: 'Ngunnawal and Ngambri peoples' },
  { name: 'Newcastle', state: 'NSW', lat: -32.9283, lng: 151.7817, tz: 'Australia/Sydney', radiusKm: 35, eventbrite: 'australia--newcastle', humanitix: 'au--nsw--newcastle', match: /newcastle/i, custodians: 'Awabakal and Worimi peoples' },
  { name: 'Hobart', state: 'TAS', lat: -42.8821, lng: 147.3272, tz: 'Australia/Hobart', radiusKm: 35, eventbrite: 'australia--hobart', humanitix: 'au--tas--hobart', match: /hobart|nipaluna/i, custodians: 'muwinina people of lutruwita (Tasmania)' },
  { name: 'Darwin', state: 'NT', lat: -12.4634, lng: 130.8456, tz: 'Australia/Darwin', radiusKm: 35, eventbrite: 'australia--darwin', humanitix: 'au--nt--darwin', match: /darwin|garramilla/i, custodians: 'Larrakia people' },
]

export const CITY_NAMES = CITIES.map((c) => c.name)
export const DEFAULT_CITY = 'Sydney'
/** Empty string means "All of Australia" */
export const ALL_CITIES = ''

export const cityDef = (name: string | null | undefined): CityDef =>
  CITIES.find((c) => c.name === name) ?? CITIES[0]

export const cityLabel = (name: string) => (name ? name : 'All of Australia')

export const ACKNOWLEDGEMENT_OF_COUNTRY =
  'We acknowledge the Traditional Custodians of the lands across Australia on which the events listed here take place, and pay our respects to Elders past and present. Always was, always will be Aboriginal land.'

/** Short acknowledgement for a single city, or a national one when no city is selected. */
export function custodiansLine(name: string | null | undefined): string {
  const c = name ? CITIES.find((x) => x.name === name) : undefined
  return c
    ? `${c.name} events take place on the lands of the ${c.custodians}, the Traditional Custodians. We pay our respects to their Elders past and present.`
    : 'Events across Australia take place on the lands of many Aboriginal and Torres Strait Islander nations. We pay our respects to their Elders past and present.'
}

const GENERIC_PLACE = /^(australia|cbd|city|inner city|online|virtual|sydney|melbourne|brisbane|perth|adelaide|hobart|canberra|darwin|gold coast|newcastle|nsw|vic|qld|wa|sa|tas|act|nt)$/i
/** True when the text actually points at the Sydney CBD, not merely "somewhere in Sydney". */
const CBD_EVIDENCE = /\b(cbd|town hall|martin place|wynyard|pitt street mall|hyde park)\b|\b2000\b/i
const STREET = /\b(st|rd|dr|ave|hwy|pde|ln|lane|cres|cct|blvd|street|road|drive|terrace|place|avenue|parade|way|court|close)\b\.?$/i

/** Best-effort suburb from an address like "12 Smith St, Coogee NSW 2034" or "Fitzroy, VIC 3065". */
export function suburbFromAddress(address: string | null | undefined): string | null {
  if (!address) return null
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean)
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i].replace(/\b\d{4}\b/g, ' ').replace(/\b(NSW|VIC|QLD|WA|SA|TAS|ACT|NT|Australia)\b/ig, ' ').replace(/\s+/g, ' ').trim()
    if (!p || /\d/.test(p) || GENERIC_PLACE.test(p) || STREET.test(p)) continue
    return p
  }
  return null
}

/**
 * Suburb to show. Stored "CBD" / the city name is a bad default when the address names a real suburb
 * (Coogee, Bankstown, …).
 */
export function displaySuburb(suburb: string | null | undefined, address: string | null | undefined, city?: string | null): string | null {
  const parsed = suburbFromAddress(address)
  const stored = suburb?.trim() || ''
  const generic = !stored || GENERIC_PLACE.test(stored) || (!!city && stored.toLowerCase() === city.trim().toLowerCase())
  if (parsed && (generic || /^cbd$/i.test(stored))) return parsed
  // Stored "CBD" with a non-CBD address (Cronulla, Coogee, Bankstown, …) is a bad default.
  if (/^cbd$/i.test(stored) && !CBD_EVIDENCE.test(address ?? '')) return parsed
  return stored || null
}

/**
 * A venue named only after the city ("Sydney") is not a place. Prefer the suburb parsed
 * from the address, otherwise TBA, so the city name is not shown as the venue.
 */
export function tidyVenueName(venueName: string | null | undefined, address: string | null | undefined, city?: string | null): string {
  const venue = (venueName ?? '').replace(/\s+/g, ' ').trim()
  const cityName = (city ?? '').trim()
  const generic = !venue || /^(tba|tbc)$/i.test(venue) || GENERIC_PLACE.test(venue) || (!!cityName && venue.toLowerCase() === cityName.toLowerCase())
  if (!generic) return venue.slice(0, 200)
  const suburb = suburbFromAddress(address)
  if (suburb && (!cityName || suburb.toLowerCase() !== cityName.toLowerCase())) return suburb.slice(0, 200)
  return 'TBA'
}
