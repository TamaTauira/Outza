/** One place formatter for cards, itinerary stops, maps, event pages and email. */

export type PlaceParts = {
  venueName?: string | null
  venueAddress?: string | null
  suburb?: string | null
  city?: string | null
}

function tidy(value?: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

function has(hay: string, needle: string): boolean {
  return !!needle && hay.toLowerCase().includes(needle.toLowerCase())
}

/** "Hobart Hobart High" → "Hobart High". */
export function collapseRepeatedWords(value: string): string {
  return tidy(value).replace(/\b([A-Za-z][A-Za-z'’-]*)\s+\1\b/gi, '$1')
}

function stripName(address: string, name: string): string {
  let next = tidy(address)
  const token = tidy(name)
  if (!next || !token) return next
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  next = next.replace(new RegExp(`^${escaped}\\b[\\s,·\\-–]*`, 'i'), '')
  next = next.replace(new RegExp(`[\\s,·\\-–]*\\b${escaped}\\b`, 'gi'), '')
  return tidy(next.replace(/(?:,\s*){2,}/g, ', ').replace(/^,\s*|,\s*$/g, ''))
}

/** "The Rocks · The Rocks" → "The Rocks". */
export function formatVenueLine(parts: PlaceParts): string {
  const city = tidy(parts.city)
  const venue = collapseRepeatedWords(parts.venueName ?? '')
  const suburb = collapseRepeatedWords(parts.suburb ?? '')
  const venueOk = !!venue && !same(venue, city)
  const suburbOk = !!suburb && !same(suburb, city) && !(venueOk && (same(suburb, venue) || has(venue, suburb)))
  return [venueOk ? venue : '', suburbOk ? suburb : ''].filter(Boolean).join(' · ')
}

/**
 * One postal line. A venue the address already starts with is not repeated,
 * and a suburb equal to the venue is dropped.
 */
export function formatAddress(parts: PlaceParts): string {
  const city = tidy(parts.city)
  const venue = collapseRepeatedWords(parts.venueName ?? '')
  const suburb = collapseRepeatedWords(parts.suburb ?? '')
  const address = stripName(collapseRepeatedWords(parts.venueAddress ?? ''), venue)
  const bits: string[] = []
  const push = (value: string) => {
    const v = tidy(value)
    if (!v) return
    if (bits.some((b) => same(b, v) || has(b, v))) return
    bits.push(v)
  }
  if (venue && !same(venue, city)) push(venue)
  push(address)
  if (suburb && !same(suburb, venue) && !same(suburb, city)) push(suburb)
  if (city) push(city)
  return bits.join(', ')
}

/** One address line, without repeating the venue, suburb or city. */
export function placeLine(parts: PlaceParts): string {
  return formatAddress(parts)
}

/** The street line under a venue name. A copy of that name at the start is dropped. */
export function addressBesideVenue(address?: string | null, venue?: string | null): string {
  const line = tidy(address)
  const name = tidy(venue)
  if (!line || !name) return line
  if (same(line, name)) return ''
  if (line.toLowerCase().startsWith(name.toLowerCase())) {
    return tidy(line.slice(name.length).replace(/^[\s,·\-–]+/, ''))
  }
  return line
}

const NOT_A_PLACE = /^(?:online|virtual|zoom|livestream|live[\s-]?stream|webinar|tba|tbc|to be announced|to be confirmed)(?:\b|[,])/i
const STREETISH = /\d|\b(?:st|street|rd|road|ave|avenue|dr|drive|ln|lane|pl|place|pde|parade|way|hwy|highway|cct|circuit|tce|terrace|cres|crescent|court|ct|blvd|boulevard|esplanade|wharf|pier|square)\b/i

export function mapsDirectionsUrl(input: {
  latitude?: number | null
  longitude?: number | null
  venueAddress?: string | null
  venueName?: string | null
  suburb?: string | null
  city?: string | null
}): string | null {
  const address = (input.venueAddress ?? '').trim()
  const name = (input.venueName ?? '').trim()
  if (NOT_A_PLACE.test(address) || (!address && NOT_A_PLACE.test(name))) return null
  const lat = input.latitude
  const lng = input.longitude
  const pinOk = typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
    && lat < -9 && lat > -45 && lng > 110 && lng < 160
    && !(Math.abs(lat + 33.6) < 0.02 && Math.abs(lng - 150.75) < 0.02)
  const withCity = (line: string) => {
    const bits = [line]
    if (input.suburb && !line.toLowerCase().includes(input.suburb.toLowerCase())) bits.push(input.suburb)
    if (input.city && !line.toLowerCase().includes(input.city.toLowerCase())) bits.push(input.city)
    return bits.join(', ')
  }
  let destination = ''
  if (address && STREETISH.test(address)) destination = withCity(address)
  else if (pinOk && lat != null && lng != null) destination = `${lat},${lng}`
  else if (address) destination = withCity(address)
  if (!destination) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}
