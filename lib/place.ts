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
