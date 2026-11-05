/**
 * Which catalogue city a venue string belongs to.
 * City words ("Sydney", "Fremantle", "Naarm") win when the feed states them.
 * Venues whose names leave the city out (Afterpay Arena, Riverstage, Optus Stadium)
 * fall back to this alias list. A postcode or pin is used when the feed has one.
 * Two different cities in one string is left unresolved.
 */
import { CITIES, type CityDef } from '@/lib/cities'

export type PlaceCityInput = {
  name?: string | null
  address?: string | null
  locality?: string | null
  region?: string | null
  postcode?: string | number | null
  lat?: number | string | null
  lng?: number | string | null
}

/**
 * Metro postcode ranges. A feed that gives a postcode and no city name still lands
 * in the right city. Ranges do not overlap: 4207 is Brisbane, 4208 is the Gold Coast.
 */
export const CITY_POSTCODES: Record<string, [number, number][]> = {
  Sydney: [[2000, 2249], [2555, 2574], [2740, 2786]],
  Newcastle: [[2280, 2310], [2318, 2324]],
  Canberra: [[2600, 2620], [2900, 2914]],
  Melbourne: [[3000, 3210], [3335, 3341], [3427, 3438], [3750, 3810], [3910, 3944], [3975, 3978]],
  Brisbane: [[4000, 4207], [4300, 4306], [4500, 4521]],
  'Gold Coast': [[4208, 4230]],
  Adelaide: [[5000, 5199]],
  Perth: [[6000, 6199]],
  Hobart: [[7000, 7055]],
  Darwin: [[800, 832]],
}

type VenueCityAlias = {
  city: string
  /** Distinctive venue, former, and precinct names. Matched as whole words. */
  names: string[]
}

/**
 * Names that identify a city without saying it.
 * Former names stay so a renamed room still files. Ambiguous names
 * (State Theatre, Festival Hall, Princess Theatre, Astor, Town Hall, Luna Park)
 * are left out: those need the feed to say which city.
 */
export const VENUE_CITY_ALIASES: VenueCityAlias[] = [
  {
    city: 'Sydney',
    names: [
      'Afterpay Arena',
      'Qudos Bank Arena',
      'Qudos Arena',
      'Qudos',
      'Allphones Arena',
      'Acer Arena',
      'SuperDome',
      'Super Dome',
      'Accor Stadium',
      'Stadium Australia',
      'ANZ Stadium',
      'Telstra Stadium',
      'Allianz Stadium',
      'Sydney Football Stadium',
      'CommBank Stadium',
      'Bankwest Stadium',
      'Western Sydney Stadium',
      'SCG',
      'Sydney Cricket Ground',
      'Hordern Pavilion',
      'The Hordern',
      'Hordern',
      'Enmore Theatre',
      'The Enmore Theatre',
      'The Enmore',
      'Enmore',
      'Factory Theatre',
      'The Factory Theatre',
      'Metro Theatre',
      'ICC Sydney',
      'ICC',
      'International Convention Centre Sydney',
      'International Convention Centre',
      'Sydney Olympic Park',
      'Homebush',
      'Moore Park',
      'Edwin Flack',
      'Darling Harbour Theatre',
      'Darling Harbour',
      'Pyrmont Theatre',
      'Pyrmont',
      'Aware Super Theatre',
      'First State Super Theatre',
      'TikTok Entertainment Centre',
      'Opera House',
      'Bennelong Point',
      'Bennelong',
      'Carriageworks',
      'City Recital Hall',
      'Oxford Art Factory',
      'Roundhouse',
      'Tumbalong Park',
      'Tumbalong',
      'Barangaroo',
      'Parramatta',
      'UNSW',
    ],
  },
  {
    city: 'Melbourne',
    names: [
      'Rod Laver Arena',
      'Rod Laver',
      'John Cain Arena',
      'Hisense Arena',
      'Vodafone Arena',
      'Margaret Court Arena',
      'Marvel Stadium',
      'Etihad Stadium',
      'Telstra Dome',
      'Docklands Stadium',
      'Colonial Stadium',
      'AAMI Park',
      'MCG',
      'Hamer Hall',
      'Palais Theatre',
      'Sidney Myer Music Bowl',
      'Myer Music Bowl',
      'Forum Theatre',
      'The Forum',
      'Forum',
      '170 Russell',
      'Corner Hotel',
      'Northcote Theatre',
      'The Night Cat',
    ],
  },
  {
    city: 'Brisbane',
    names: [
      'Riverstage',
      'Suncorp Stadium',
      'Lang Park',
      'The Gabba',
      'Gabba',
      'The Tivoli',
      'The Triffid',
      'Fortitude Music Hall',
      'The Fortitude Music Hall',
      'QPAC',
      'Queensland Performing Arts Centre',
      'Crowbar',
    ],
  },
  {
    city: 'Perth',
    names: [
      'Optus Stadium',
      'RAC Arena',
      'HBF Park',
      'HBF Stadium',
      'nib Stadium',
      'Challenge Stadium',
      'Red Hill Auditorium',
      'Ice Cream Factory',
      'Freo.Social',
      'Freo',
      'Kings Park',
    ],
  },
  {
    city: 'Adelaide',
    names: [
      'Thebarton Theatre',
      'Thebby',
      'Coopers Stadium',
      'Hindmarsh Stadium',
      'AAMI Stadium',
      'Hindley Street Music Hall',
      'Lion Arts Factory',
      'Lion Arts',
      'The Gov',
      'Governor Hindmarsh',
    ],
  },
  {
    city: 'Gold Coast',
    names: [
      'HOTA',
      'Home of the Arts',
      'Cbus Super Stadium',
      'Metricon Stadium',
      'Heritage Bank Stadium',
      'Robina Stadium',
    ],
  },
  {
    city: 'Newcastle',
    names: [
      'McDonald Jones Stadium',
      'Hunter Stadium',
      'EnergyAustralia Stadium',
      'Ausgrid Stadium',
      'King Street Bandroom',
    ],
  },
  {
    city: 'Canberra',
    names: [
      'GIO Stadium',
      'AIS Arena',
      'Manuka Oval',
      'The Baso',
    ],
  },
  {
    city: 'Hobart',
    names: [
      'MyState Bank Arena',
      'Derwent Entertainment Centre',
      'Blundstone Arena',
      'Ninja Stadium',
      'Bellerive Oval',
      'Wrest Point',
      'Odeon Theatre',
    ],
  },
  {
    city: 'Darwin',
    names: [
      'TIO Stadium',
      'Marrara Oval',
      'Mindil Beach',
    ],
  },
]

function clean(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value !== 'string') return ''
  const text = value.trim()
  if (!text || /^null$/i.test(text)) return ''
  return text
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

/** Equirectangular kilometres. Same check the ticket feeds used before this map existed. */
function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = Math.PI / 180
  const x = (bLng - aLng) * r * Math.cos(((aLat + bLat) / 2) * r)
  const y = (bLat - aLat) * r
  return Math.sqrt(x * x + y * y) * 6371
}

function fold(text: string): string {
  const inner = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  return inner ? ` ${inner} ` : ''
}

function hasPhrase(folded: string, phrase: string): boolean {
  const inner = phrase.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (inner.length < 3) return false
  return folded.includes(` ${inner} `)
}

/** The city word that sits latest in the text. "Venue, Melbourne" beats an earlier "Sydney". */
export function cityMentioned(text: string | null | undefined): CityDef | null {
  const hay = clean(text)
  if (!hay) return null
  let best: { city: CityDef; at: number } | null = null
  for (const city of CITIES) {
    const found = hay.match(city.match)
    if (!found || found.index == null) continue
    if (!best || found.index >= best.at) best = { city, at: found.index }
  }
  return best?.city ?? null
}

export function cityFromPostcode(postcode: string | number | null | undefined): CityDef | null {
  const raw = clean(postcode)
  const match = raw.match(/^0?(\d{3,4})$/)
  if (!match) return null
  const pc = parseInt(match[1], 10)
  if (!Number.isFinite(pc)) return null
  const name = Object.keys(CITY_POSTCODES).find((city) => CITY_POSTCODES[city].some(([a, b]) => pc >= a && pc <= b))
  return name ? CITIES.find((c) => c.name === name) ?? null : null
}

export function cityFromCoords(lat: unknown, lng: unknown): CityDef | null {
  const a = numberOrNull(lat)
  const b = numberOrNull(lng)
  if (a == null || b == null || !(a || b)) return null
  return CITIES.find((c) => km(a, b, c.lat, c.lng) <= c.radiusKm) ?? null
}

function labelledPostcode(text: string): string | null {
  const matches = [...text.matchAll(/\b(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s+(0?\d{3,4})\b/gi)]
  return matches.length ? matches[matches.length - 1][1] : null
}

/** Cities whose venue aliases appear in the text. One entry per city. */
export function aliasCities(text: string | null | undefined): string[] {
  const folded = fold(clean(text))
  if (!folded) return []
  const found: string[] = []
  for (const group of VENUE_CITY_ALIASES) {
    if (group.names.some((name) => hasPhrase(folded, name))) found.push(group.city)
  }
  return found
}

/**
 * Resolve a feed place to a catalogue city.
 * Order matches the ticket feeds: pin, then postcode, then a stated city, then the venue alias.
 * A stated city beats an alias, so "Hordern Pavilion, Melbourne" stays Melbourne.
 */
export function cityFromPlace(input: PlaceCityInput = {}): CityDef | null {
  const name = clean(input.name)
  const address = clean(input.address)
  const locality = clean(input.locality)
  const region = clean(input.region)
  const pinned = cityFromCoords(input.lat, input.lng)
  if (pinned) return pinned
  const coded = cityFromPostcode(input.postcode)
    ?? cityFromPostcode(labelledPostcode([address, locality, region, name, clean(input.postcode)].filter(Boolean).join(' ')))
  if (coded) return coded
  const stated = cityMentioned([locality, region, address].filter(Boolean).join(' ')) ?? cityMentioned(name)
  if (stated) return stated
  const aliased = aliasCities([name, address, locality, region].filter(Boolean).join(' '))
  if (aliased.length !== 1) return null
  return CITIES.find((c) => c.name === aliased[0]) ?? null
}
