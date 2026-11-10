/** One address line, without repeating the venue, suburb or city. */

export function placeLine(parts: {
  venueName?: string | null
  venueAddress?: string | null
  suburb?: string | null
  city?: string | null
}): string {
  const bits: string[] = []
  const push = (value?: string | null) => {
    const v = (value ?? '').trim()
    if (!v) return
    const low = v.toLowerCase()
    if (bits.some((b) => b.toLowerCase() === low || b.toLowerCase().includes(low) || low.includes(b.toLowerCase()))) return
    bits.push(v)
  }
  const venue = (parts.venueName ?? '').trim()
  const city = (parts.city ?? '').trim()
  // A venue literally named after the city is a bad default, not a place name.
  if (venue && venue.toLowerCase() !== city.toLowerCase()) push(venue)
  push(parts.venueAddress)
  push(parts.suburb)
  push(city)
  return bits.join(', ')
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
