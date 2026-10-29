/**
 * Pins a listing on the suburb or postcode in the address.
 * City-centre coordinates are only used for a real CBD / capital postcode.
 * A Fitzroy or Glebe address must not inherit the CBD pin.
 */
import { areasForCity, guessSuburb } from '@/lib/categories'
import { cityDef, suburbFromAddress } from '@/lib/cities'
import { locateAddress } from '@/lib/geocode'
import { distanceKm } from '@/lib/travel'

export interface ListingPlace {
  suburb: string | null
  postcode: string | null
  lat: number | null
  lng: number | null
  /** True when the pin is a suburb/postcode centroid or a geocode we accepted. */
  precise: boolean
}

/** Capital-city postcodes. A pin on the city centre is honest for these. */
const CBD_POSTCODE: Record<string, string> = {
  Sydney: '2000',
  Melbourne: '3000',
  Brisbane: '4000',
  'Gold Coast': '4217',
  Perth: '6000',
  Adelaide: '5000',
  Canberra: '2601',
  Newcastle: '2300',
  Hobart: '7000',
  Darwin: '0800',
}

interface Centroid { lat: number; lng: number; suburb: string; city: string }

/** Postcode centroids for inner suburbs. Enough to keep Intelligence off the CBD postcode. */
const POSTCODE: Record<string, Centroid> = {
  '2000': { lat: -33.8688, lng: 151.2093, suburb: 'Sydney', city: 'Sydney' },
  '2010': { lat: -33.884, lng: 151.214, suburb: 'Surry Hills', city: 'Sydney' },
  '2011': { lat: -33.873, lng: 151.221, suburb: 'Potts Point', city: 'Sydney' },
  '2016': { lat: -33.893, lng: 151.204, suburb: 'Redfern', city: 'Sydney' },
  '2021': { lat: -33.884, lng: 151.226, suburb: 'Paddington', city: 'Sydney' },
  '2026': { lat: -33.891, lng: 151.274, suburb: 'Bondi', city: 'Sydney' },
  '2031': { lat: -33.920, lng: 151.256, suburb: 'Randwick', city: 'Sydney' },
  '2034': { lat: -33.920, lng: 151.256, suburb: 'Coogee', city: 'Sydney' },
  '2037': { lat: -33.879, lng: 151.185, suburb: 'Glebe', city: 'Sydney' },
  '2042': { lat: -33.898, lng: 151.180, suburb: 'Newtown', city: 'Sydney' },
  '2048': { lat: -33.875, lng: 151.155, suburb: 'Stanmore', city: 'Sydney' },
  '2131': { lat: -33.855, lng: 151.103, suburb: 'Ashfield', city: 'Sydney' },
  '2150': { lat: -33.815, lng: 151.001, suburb: 'Parramatta', city: 'Sydney' },
  '2204': { lat: -33.911, lng: 151.155, suburb: 'Marrickville', city: 'Sydney' },
  '3000': { lat: -37.8136, lng: 144.9631, suburb: 'Melbourne', city: 'Melbourne' },
  '3002': { lat: -37.816, lng: 144.986, suburb: 'East Melbourne', city: 'Melbourne' },
  '3004': { lat: -37.838, lng: 144.980, suburb: 'St Kilda Road', city: 'Melbourne' },
  '3006': { lat: -37.823, lng: 144.962, suburb: 'Southbank', city: 'Melbourne' },
  '3008': { lat: -37.815, lng: 144.946, suburb: 'Docklands', city: 'Melbourne' },
  '3051': { lat: -37.787, lng: 144.944, suburb: 'North Melbourne', city: 'Melbourne' },
  '3053': { lat: -37.795, lng: 144.967, suburb: 'Carlton', city: 'Melbourne' },
  '3054': { lat: -37.787, lng: 144.951, suburb: 'Carlton North', city: 'Melbourne' },
  '3056': { lat: -37.766, lng: 144.960, suburb: 'Brunswick', city: 'Melbourne' },
  '3057': { lat: -37.766, lng: 144.961, suburb: 'Brunswick East', city: 'Melbourne' },
  '3065': { lat: -37.799, lng: 144.978, suburb: 'Fitzroy', city: 'Melbourne' },
  '3066': { lat: -37.802, lng: 144.988, suburb: 'Collingwood', city: 'Melbourne' },
  '3067': { lat: -37.799, lng: 144.994, suburb: 'Abbotsford', city: 'Melbourne' },
  '3068': { lat: -37.781, lng: 144.978, suburb: 'Fitzroy North', city: 'Melbourne' },
  '3070': { lat: -37.771, lng: 144.999, suburb: 'Northcote', city: 'Melbourne' },
  '3121': { lat: -37.818, lng: 145.002, suburb: 'Richmond', city: 'Melbourne' },
  '3141': { lat: -37.839, lng: 144.992, suburb: 'South Yarra', city: 'Melbourne' },
  '3181': { lat: -37.859, lng: 144.989, suburb: 'Prahran', city: 'Melbourne' },
  '3182': { lat: -37.868, lng: 144.981, suburb: 'St Kilda', city: 'Melbourne' },
  '3205': { lat: -37.831, lng: 144.960, suburb: 'South Melbourne', city: 'Melbourne' },
  '4000': { lat: -27.4698, lng: 153.0251, suburb: 'Brisbane City', city: 'Brisbane' },
  '4006': { lat: -27.457, lng: 153.035, suburb: 'Fortitude Valley', city: 'Brisbane' },
  '4101': { lat: -27.482, lng: 153.011, suburb: 'South Brisbane', city: 'Brisbane' },
  '4102': { lat: -27.494, lng: 153.036, suburb: 'Woolloongabba', city: 'Brisbane' },
  '5000': { lat: -34.9285, lng: 138.6007, suburb: 'Adelaide', city: 'Adelaide' },
  '6000': { lat: -31.9523, lng: 115.8613, suburb: 'Perth', city: 'Perth' },
  '6003': { lat: -31.946, lng: 115.858, suburb: 'Northbridge', city: 'Perth' },
  '6160': { lat: -32.056, lng: 115.748, suburb: 'Fremantle', city: 'Perth' },
  '7000': { lat: -42.8821, lng: 147.3272, suburb: 'Hobart', city: 'Hobart' },
  '2601': { lat: -35.281, lng: 149.129, suburb: 'Canberra', city: 'Canberra' },
  '0800': { lat: -12.4634, lng: 130.8456, suburb: 'Darwin City', city: 'Darwin' },
}

/** Suburb names that share a postcode, or that the area list uses, with their own pin. */
const SUBURB: Record<string, { lat: number; lng: number; postcode: string }> = {
  'Sydney|Surry Hills': { lat: -33.886, lng: 151.211, postcode: '2010' },
  'Sydney|Darlinghurst': { lat: -33.878, lng: 151.219, postcode: '2010' },
  'Sydney|Redfern': { lat: -33.893, lng: 151.204, postcode: '2016' },
  'Sydney|Glebe': { lat: -33.879, lng: 151.185, postcode: '2037' },
  'Sydney|Bondi': { lat: -33.891, lng: 151.274, postcode: '2026' },
  'Sydney|Newtown': { lat: -33.898, lng: 151.180, postcode: '2042' },
  'Sydney|Marrickville': { lat: -33.911, lng: 151.155, postcode: '2204' },
  'Sydney|Parramatta': { lat: -33.815, lng: 151.001, postcode: '2150' },
  'Sydney|Paddington': { lat: -33.884, lng: 151.226, postcode: '2021' },
  'Melbourne|Fitzroy': { lat: -37.799, lng: 144.978, postcode: '3065' },
  'Melbourne|Collingwood': { lat: -37.802, lng: 144.988, postcode: '3066' },
  'Melbourne|Carlton': { lat: -37.795, lng: 144.967, postcode: '3053' },
  'Melbourne|Brunswick': { lat: -37.766, lng: 144.960, postcode: '3056' },
  'Melbourne|Northcote': { lat: -37.771, lng: 144.999, postcode: '3070' },
  'Melbourne|Richmond': { lat: -37.818, lng: 145.002, postcode: '3121' },
  'Melbourne|Southbank': { lat: -37.823, lng: 144.962, postcode: '3006' },
  'Melbourne|Docklands': { lat: -37.815, lng: 144.946, postcode: '3008' },
  'Melbourne|St Kilda': { lat: -37.868, lng: 144.981, postcode: '3182' },
  'Melbourne|East Melbourne': { lat: -37.816, lng: 144.986, postcode: '3002' },
  'Brisbane|Fortitude Valley': { lat: -27.457, lng: 153.035, postcode: '4006' },
  'Brisbane|West End': { lat: -27.482, lng: 153.010, postcode: '4101' },
  'Brisbane|South Brisbane': { lat: -27.475, lng: 153.017, postcode: '4101' },
  'Perth|Fremantle': { lat: -32.056, lng: 115.748, postcode: '6160' },
  'Perth|Northbridge': { lat: -31.946, lng: 115.858, postcode: '6003' },
  'Adelaide|North Adelaide': { lat: -34.908, lng: 138.595, postcode: '5006' },
}

const GENERIC_SUBURB = /^(australia|cbd|city|inner city|online|virtual|sydney|melbourne|brisbane|perth|adelaide|hobart|canberra|darwin|gold coast|newcastle)$/i

export function extractPostcode(address: string | null | undefined): string | null {
  if (!address) return null
  const hits = [...address.matchAll(/\b(\d{4})\b/g)].map((m) => m[1]).filter((p) => {
    const n = Number(p)
    if (n < 200 || n > 9999) return false
    // 1900–2099 is usually a year, unless it is a real postcode (2000, 2026, …) or follows a state.
    if (n >= 1900 && n <= 2099 && !POSTCODE[p] && !new RegExp(`\\b(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\\s+${p}\\b`, 'i').test(address)) return false
    return true
  })
  const pick = hits.at(-1)
  return pick ? pick.padStart(4, '0') : null
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')
}

const STREET_AFTER = String.raw`(?!\s+(?:st|street|rd|road|ave|avenue|hwy|highway|pde|parade|ln|lane|dr|drive|tce|terrace|pl|place|way|cct|cres|crescent|blvd|boulevard)\b)`

/** Longest known suburb named in the text. A street called Brunswick St is not the suburb Brunswick. */
export function suburbNamedIn(text: string, city: string): string | null {
  const areas = areasForCity(city).filter((a) => !/^cbd$/i.test(a)).sort((a, b) => b.length - a.length)
  for (const area of areas) {
    if (new RegExp(`\\b${escapeRe(area)}\\b${STREET_AFTER}`, 'i').test(text)) return area
  }
  return null
}

export function placeFromText(input: {
  venueAddress?: string | null
  venueName?: string | null
  suburb?: string | null
  city: string
}): ListingPlace {
  const city = input.city
  const address = input.venueAddress ?? ''
  const blob = `${input.venueName ?? ''} ${address} ${input.suburb ?? ''}`
  const postcode = extractPostcode(address)
  let suburb = suburbNamedIn(blob, city) ?? suburbFromAddress(address)
  if (city === 'Sydney') suburb = suburbNamedIn(blob, city) ?? guessSuburb(input.venueName ?? '', address) ?? suburbFromAddress(address)
  if (suburb && (GENERIC_SUBURB.test(suburb) || suburb.toLowerCase() === city.toLowerCase())) suburb = suburbNamedIn(blob, city)
  if (suburb && GENERIC_SUBURB.test(suburb)) suburb = null
  const stored = input.suburb?.trim() || ''
  if (!suburb && stored && !GENERIC_SUBURB.test(stored) && stored.toLowerCase() !== city.toLowerCase()) suburb = stored

  const byPost = postcode ? POSTCODE[postcode] ?? POSTCODE[postcode.replace(/^0/, '')] : undefined
  const byName = suburb ? SUBURB[`${city}|${suburb}`] : undefined
  if (byName && (!byPost || byPost.city === city)) {
    return { suburb, postcode: postcode ?? byName.postcode, lat: byName.lat, lng: byName.lng, precise: true }
  }
  if (byPost && (!city || byPost.city === city)) {
    const named = suburb && suburb.toLowerCase() !== city.toLowerCase() ? suburb : (/sydney|melbourne|brisbane|perth|adelaide|hobart|canberra|darwin/i.test(byPost.suburb) ? null : byPost.suburb)
    return { suburb: named ?? suburb, postcode: postcode ?? null, lat: byPost.lat, lng: byPost.lng, precise: true }
  }
  if (byPost && byPost.city !== city) {
    // Postcode belongs to another city. Do not pin it on this city's CBD.
    return { suburb, postcode, lat: null, lng: null, precise: false }
  }
  return { suburb, postcode, lat: null, lng: null, precise: false }
}

/** True when a stored pin is just the city centre and the listing names somewhere else. */
export function pinIsCityDump(lat: number | null | undefined, lng: number | null | undefined, city: string, suburb?: string | null, postcode?: string | null): boolean {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return false
  const centre = cityDef(city)
  if (distanceKm({ lat, lng }, { lat: centre.lat, lng: centre.lng }) > 0.8) return false
  const cbd = CBD_POSTCODE[city]
  if (postcode && cbd && postcode === cbd) return false
  if (!suburb || /^cbd$/i.test(suburb) || suburb.toLowerCase() === city.toLowerCase()) {
    if (!postcode || (cbd && postcode === cbd)) return false
  }
  return true
}

/** Suburb/postcode centroid first. A geocoder result is kept only when it is not the city centre for a non-CBD address. */
export async function resolveListingPlace(input: {
  venueAddress?: string | null
  venueName?: string | null
  suburb?: string | null
  city: string
}): Promise<ListingPlace> {
  const local = placeFromText(input)
  if (local.lat != null && local.lng != null) return local
  const q = [input.venueAddress, local.suburb, local.postcode, input.city, 'Australia'].filter(Boolean).join(', ')
  if (!input.venueAddress?.trim() && !local.suburb && !local.postcode) return local
  const geo = await locateAddress(q, input.city).catch(() => null)
  if (!geo || pinIsCityDump(geo.lat, geo.lng, input.city, local.suburb, local.postcode)) return local
  return { ...local, lat: geo.lat, lng: geo.lng, precise: true }
}

/** Prefer a suburb pin over a stored city-centre pin. */
export function correctPin(lat: number | null | undefined, lng: number | null | undefined, place: ListingPlace, city: string): { lat: number | null; lng: number | null } {
  const dump = pinIsCityDump(lat, lng, city, place.suburb, place.postcode)
  if (place.lat != null && place.lng != null && (lat == null || lng == null || dump)) return { lat: place.lat, lng: place.lng }
  if (dump) return { lat: null, lng: null }
  return { lat: lat ?? null, lng: lng ?? null }
}
