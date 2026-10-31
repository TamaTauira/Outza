/**
 * Read a venue name and street address off an original listing page.
 * Facts come from the page (structured data, source markup, then a location line).
 * Nothing here invents a street, a suburb, or a pin.
 */
import { cityDef, suburbFromAddress } from '@/lib/cities'
import { distanceKm } from '@/lib/travel'
import { pinIsCityDump, placeFromText } from '@/lib/venue-place'

export type ListingAttendance = 'place' | 'online' | 'tba' | 'unknown'

export interface ExtractedVenue {
  venueName: string | null
  address: string | null
  lat: number | null
  lng: number | null
  attendance: ListingAttendance
}

export type CoordNoticeKind = 'no-address' | 'online' | 'tba' | 'fetch-failed' | 'unplaced' | 'no-link'

const STREET = /\b(?:streets?|sts|roads?|rds|avenues?|aves|drives?|dr|parades?|pde|lanes?|ln|places?|pl|terraces?|tce|crescents?|cres|courts?|ct|ways?|boulevards?|blvd|highways?|hwy|closes?|circuits?|cct|groves?|esplanades?|malls?|squares?|wharfs?|piers?|st|rd|ave|ln|pl|ct)\b\.?/i
const STATE = /\b(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b/
const ONLINE_NAME = /^(?:online|virtual|zoom|livestream|live[\s-]?stream|webinar)$/i
const TBA_NAME = /^(?:tba|tbc|to be announced|to be confirmed|venue tba|venue tbc|location tba)$/i
const GENERIC_PLACE = /^(?:australia|cbd|city|inner city|online|virtual|sydney|melbourne|brisbane|perth|adelaide|hobart|canberra|darwin|gold coast|newcastle|the rocks|darlinghurst|hamilton|nsw|vic|qld|wa|sa|tas|act|nt)$/i

export function isStreetAddress(value: string | null | undefined): boolean {
  const text = clean(value)
  if (!text || text.length > 240) return false
  if (ONLINE_NAME.test(text) || TBA_NAME.test(text)) return false
  if (!STREET.test(text)) return false
  return /\d/.test(text) || STATE.test(text)
}

const CONNECT_PLACEHOLDER = /see event description for details on how to connect/i

/** City of Sydney parks online events on this rounded point. It is not a venue. */
export function isOnlineSentinel(lat: number, lng: number): boolean {
  return Math.abs(lat + 33.6) < 0.001 && Math.abs(lng - 150.75) < 0.001
}

function isConnectPlaceholder(value: string | null | undefined): boolean {
  return CONNECT_PLACEHOLDER.test(clean(value))
}

/** A location line the page states, including a place without a street number. */
export function statedPlaceAddress(value: string | null | undefined): string | null {
  const text = clean(value)
  if (!text || text.length > 240 || ONLINE_NAME.test(text) || TBA_NAME.test(text) || isConnectPlaceholder(text)) return null
  if (isStreetAddress(text)) return text
  if (STATE.test(text) || /\b\d{4}\b/.test(text)) return text
  return null
}

/**
 * A named place we can try to geocode: a street, or a venue line that is more than the city.
 * "Sydney, NSW" and the online connect blurb are not places.
 */
export function isSpecificPlace(value: string | null | undefined): boolean {
  const text = statedPlaceAddress(value)
  if (!text || isConnectPlaceholder(text)) return false
  if (isStreetAddress(text)) return true
  const stripped = text
    .replace(/\b(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT|Australia)\b/gi, ' ')
    .replace(/\b\d{4}\b/g, ' ')
    .replace(/[,\s]+/g, ' ')
    .trim()
  if (!stripped || stripped.length < 4 || GENERIC_PLACE.test(stripped) || ONLINE_NAME.test(stripped)) return false
  return true
}

export function noteNotVenue(name: string | null | undefined): boolean {
  const text = clean(name)
  if (!text) return false
  return /available online|\bonline\b|\bvirtual\b|community hall/i.test(text) && !isStreetAddress(text)
}

/** A notice is raised only after the original listing has been read. A stored name of TBA is not that reading. */
export function coordsNoticeKind(outcome: CoordNoticeKind | 'fixed' | undefined): CoordNoticeKind | null {
  if (!outcome || outcome === 'fixed') return null
  return outcome
}

export function missingCoordsNotice(title: string, kind: CoordNoticeKind): string {
  const name = title.trim() || 'Listing'
  switch (kind) {
    case 'no-address':
      return `${name}: the original listing has no venue address. Left on the board.`
    case 'online':
      return `${name}: the original listing is online, so there is no venue to pin. Left on the board.`
    case 'tba':
      return `${name}: the original listing marks the venue as TBA. Left on the board.`
    case 'fetch-failed':
      return `${name}: the original listing could not be fetched. Left on the board. This will be tried again.`
    case 'unplaced':
      return `${name}: the listing gives an address, but it could not be placed in the event's city. Left on the board. This will be tried again.`
    case 'no-link':
      return `${name}: no original listing link, so there is no page to read a venue address from. Left on the board.`
  }
}

/** A page pin or geocode is kept only when it lands in the event's city, and not on the wrong suburb. */
export function pinFitsCity(lat: number, lng: number, city: string, address?: string | null, suburb?: string | null): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) return false
  if (isOnlineSentinel(lat, lng)) return false
  const def = cityDef(city)
  if (!def || def.name !== city) return false
  if (distanceKm({ lat, lng }, { lat: def.lat, lng: def.lng }) > def.radiusKm + 20) return false
  const place = placeFromText({ venueAddress: address, suburb, city })
  if (pinIsCityDump(lat, lng, city, place.suburb, place.postcode)) return false
  if (place.lat != null && place.lng != null && place.suburb && place.suburb.toLowerCase() !== city.toLowerCase()) {
    if (distanceKm({ lat, lng }, { lat: place.lat, lng: place.lng }) > 20) return false
  }
  return true
}

interface Part {
  venueName?: string | null
  address?: string | null
  lat?: number | null
  lng?: number | null
  attendance?: ListingAttendance
  rank: number
}

export function extractListingVenue(html: string, pageUrl = ''): ExtractedVenue {
  const parts: Part[] = [
    ...jsonLdParts(html),
    ...microdataParts(html),
    ...humanitixParts(html),
    ...cityOfSydneyParts(html),
    ...eventbriteParts(html),
    ...embeddedVenueParts(html),
    ...metaParts(html),
    ...mapParts(html, pageUrl),
  ]
  const street = parts.filter((p) => isStreetAddress(p.address)).sort((a, b) => b.rank - a.rank)[0]
  const placeOnly = parts.filter((p) => statedPlaceAddress(p.address) && !isStreetAddress(p.address)).sort((a, b) => b.rank - a.rank)[0]
  let address = street?.address ? clean(street.address) : statedPlaceAddress(placeOnly?.address)
  if (!address) {
    const visible = visibleAddress(html)
    if (visible) address = visible
  }
  const namePart = parts
    .filter((p) => properVenueName(p.venueName, address))
    .sort((a, b) => b.rank - a.rank)[0]
  const coordPart = (street && pair(street.lat, street.lng) ? street : null)
    ?? parts.filter((p) => pair(p.lat, p.lng)).sort((a, b) => b.rank - a.rank)[0]
  const rawCoords = coordPart ? pair(coordPart.lat, coordPart.lng) : null
  const coords = rawCoords && !isOnlineSentinel(rawCoords.lat, rawCoords.lng) ? rawCoords : null
  // Only the event's own venue field. A TBA in the nav, a related event, or a template is ignored.
  const ownOnline = parts.some((p) => p.attendance === 'online' && !isStreetAddress(p.address) && !isSpecificPlace(p.address))
  const ownTba = parts.some((p) => p.attendance === 'tba' && !isStreetAddress(p.address) && !isSpecificPlace(p.address))
  const specific = isStreetAddress(address) || (isSpecificPlace(address) && !ownOnline)
  let attendance: ListingAttendance = 'unknown'
  if (specific) attendance = 'place'
  else if (ownOnline) attendance = 'online'
  else if (ownTba) attendance = 'tba'
  return {
    venueName: properVenueName(namePart?.venueName, address),
    address: specific ? address : null,
    lat: specific ? coords?.lat ?? null : null,
    lng: specific ? coords?.lng ?? null : null,
    attendance,
  }
}

export function mergeVenueFacts(
  current: { venueName: string; venueAddress: string | null },
  extracted: { venueName: string | null; address: string | null },
): { venueName: string; venueAddress: string | null } {
  const street = isStreetAddress(extracted.address) ? clean(extracted.address) : null
  const currentStreet = isStreetAddress(current.venueAddress) ? clean(current.venueAddress) : null
  const place = statedPlaceAddress(extracted.address)
  const venueAddress = street ?? currentStreet ?? place ?? current.venueAddress ?? null
  const named = properVenueName(extracted.venueName, venueAddress)
  let venueName = named ?? current.venueName
  if (noteNotVenue(venueName)) venueName = suburbFromAddress(venueAddress) || 'TBA'
  return { venueName, venueAddress }
}

export function classifyVenueOutcome(input: {
  fetchFailed: boolean
  hadLink: boolean
  extracted: ExtractedVenue | null
  storedAddress?: string | null
  pin: { lat: number; lng: number } | null
}): CoordNoticeKind | 'fixed' {
  if (input.pin) return 'fixed'
  const attendance = input.extracted?.attendance
  const stated = input.extracted?.address || input.storedAddress
  if (attendance === 'online') return 'online'
  if (attendance === 'tba' && !isSpecificPlace(stated)) return 'tba'
  if (isStreetAddress(stated) || isSpecificPlace(stated)) return 'unplaced'
  if (!input.hadLink) return 'no-link'
  if (input.fetchFailed || !input.extracted) return 'fetch-failed'
  return 'no-address'
}

function properVenueName(name: string | null | undefined, address: string | null): string | null {
  const text = clean(name)
  if (!text || text.length > 120) return null
  if (ONLINE_NAME.test(text) || TBA_NAME.test(text) || GENERIC_PLACE.test(text)) return null
  if (/^(?:enter|meet|please|via|doors|located|level|upstairs|downstairs|parking|note|also)\b/i.test(text)) return null
  if (noteNotVenue(text)) return null
  if (address && text.toLowerCase() === address.toLowerCase()) return null
  if (isStreetAddress(text) && text.split(/\s+/).length < 6) return null
  if (/[.!?]/.test(text) && text.split(/\s+/).length > 8) return null
  return text
}

function clean(value: string | null | undefined): string {
  return decode(value ?? '').slice(0, 300)
}

function decode(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;|&rsquo;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\n/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function pair(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const a = num(lat)
  const b = num(lng)
  if (a == null || b == null) return null
  if (Math.abs(a) < 0.01 && Math.abs(b) < 0.01) return null
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null
  return { lat: a, lng: b }
}

function scriptBlocks(html: string, type: RegExp): string[] {
  const out: string[] = []
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    if (type.test(m[1])) out.push(m[2].trim())
  }
  return out
}

function nodesOf(data: unknown): unknown[] {
  if (!data) return []
  if (Array.isArray(data)) return data.flatMap(nodesOf)
  if (typeof data === 'object') {
    const graph = (data as { '@graph'?: unknown })['@graph']
    if (Array.isArray(graph)) return graph.flatMap(nodesOf)
    return [data]
  }
  return []
}

function typesOf(node: unknown): string[] {
  const t = (node as { '@type'?: unknown })?.['@type']
  const list = Array.isArray(t) ? t : [t]
  return list.filter((x) => typeof x === 'string') as string[]
}

function formatPostal(addr: unknown): string | null {
  if (!addr) return null
  if (typeof addr === 'string') return clean(addr) || null
  if (typeof addr !== 'object') return null
  const a = addr as Record<string, unknown>
  const street = typeof a.streetAddress === 'string' ? a.streetAddress : ''
  if (street && STATE.test(street) && /\d{4}/.test(street)) return clean(street) || null
  const locality = typeof a.addressLocality === 'string' ? a.addressLocality : ''
  const region = typeof a.addressRegion === 'string' ? a.addressRegion : ''
  const post = a.postalCode != null ? String(a.postalCode) : ''
  const line = [street, locality, [region, post].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return clean(line) || null
}

function readGeo(node: unknown): { lat: number; lng: number } | null {
  if (!node || typeof node !== 'object') return null
  const n = node as Record<string, unknown>
  const geo = (n.geo && typeof n.geo === 'object' ? n.geo : n) as Record<string, unknown>
  return pair(geo.latitude ?? geo.lat, geo.longitude ?? geo.lng ?? geo.lon)
}

function attendanceOf(node: unknown): ListingAttendance | undefined {
  const mode = (node as { eventAttendanceMode?: unknown })?.eventAttendanceMode
  const text = Array.isArray(mode) ? mode.join(' ') : String(mode ?? '')
  const online = /OnlineEventAttendanceMode/i.test(text)
  const offline = /OfflineEventAttendanceMode|MixedEventAttendanceMode/i.test(text)
  if (online && !offline) return 'online'
  return undefined
}

function jsonLdParts(html: string): Part[] {
  const parts: Part[] = []
  for (const raw of scriptBlocks(html, /application\/ld\+json/i)) {
    let data: unknown
    try { data = JSON.parse(raw) } catch { continue }
    for (const node of nodesOf(data)) {
      if (!node || typeof node !== 'object') continue
      const types = typesOf(node)
      const event = types.some((t) => /Event$/i.test(t))
      const place = types.some((t) => /Place|LocalBusiness|Restaurant|CivicStructure/i.test(t))
      if (!event && !place) continue
      const loc = event ? (node as { location?: unknown }).location : node
      const places = Array.isArray(loc) ? loc : [loc]
      for (const p of places) {
        if (!p || typeof p !== 'object') continue
        const placeNode = p as Record<string, unknown>
        const address = formatPostal(placeNode.address)
        const coords = readGeo(placeNode) ?? readGeo(node)
        const name = typeof placeNode.name === 'string' ? placeNode.name : null
        parts.push({
          venueName: name,
          address,
          lat: coords?.lat,
          lng: coords?.lng,
          attendance: attendanceOf(node),
          rank: 70,
        })
      }
      if (event && !places.some((p) => p && typeof p === 'object')) {
        const att = attendanceOf(node)
        if (att) parts.push({ attendance: att, rank: 70 })
      }
    }
  }
  return parts
}

function microdataParts(html: string): Part[] {
  const chunks = html.match(/<[^>]+itemtype=["'][^"']*(?:Place|PostalAddress)[^"']*["'][^>]*>[\s\S]{0,1200}/gi) ?? []
  return chunks.map((chunk) => {
    const street = prop(chunk, 'streetAddress')
    const locality = prop(chunk, 'addressLocality')
    const region = prop(chunk, 'addressRegion')
    const post = prop(chunk, 'postalCode')
    const address = formatPostal({ streetAddress: street, addressLocality: locality, addressRegion: region, postalCode: post })
    const coords = pair(prop(chunk, 'latitude'), prop(chunk, 'longitude'))
    return {
      venueName: prop(chunk, 'name'),
      address,
      lat: coords?.lat,
      lng: coords?.lng,
      rank: 60,
    }
  })
}

function prop(chunk: string, name: string): string | null {
  const content = chunk.match(new RegExp(`itemprop=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i'))
  if (content?.[1]) return decode(content[1])
  const text = chunk.match(new RegExp(`itemprop=["']${name}["'][^>]*>([^<]+)`, 'i'))
  return text?.[1] ? decode(text[1]) : null
}

function humanitixParts(html: string): Part[] {
  const at = html.indexOf('latLng:"')
  if (at < 0 && !/venueName:"/.test(html.slice(0, 8000))) return []
  const window = at >= 0 ? html.slice(Math.max(0, at - 900), at + 200) : html.slice(0, 8000)
  const latLng = window.match(/latLng:"(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)"/)
  const address = window.match(/\baddress:"((?:\\.|[^"\\])*)"/)
  const venueName = window.match(/\bvenueName:"((?:\\.|[^"\\])*)"/)
  const type = window.match(/\btype:"([a-zA-Z]+)"/)
  if (!latLng && !address && !venueName) return []
  const kind = (type?.[1] ?? '').toLowerCase()
  const coords = latLng ? pair(latLng[1], latLng[2]) : null
  return [{
    venueName: venueName ? decode(venueName[1]) : null,
    address: address ? decode(address[1]) : null,
    lat: coords?.lat,
    lng: coords?.lng,
    attendance: kind === 'online' ? 'online' : kind === 'tba' || kind === 'tbc' ? 'tba' : undefined,
    rank: 85,
  }]
}

function cityOfSydneyParts(html: string): Part[] {
  const raw = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1]
  if (!raw) return []
  let data: unknown
  try { data = JSON.parse(raw) } catch { return [] }
  const ed = (data as { props?: { pageProps?: { eventData?: Record<string, unknown> } } })?.props?.pageProps?.eventData
  if (!ed || typeof ed !== 'object') return []
  const venue = ed.eventVenue && typeof ed.eventVenue === 'object' ? ed.eventVenue as Record<string, unknown> : null
  const eventAddress = typeof ed.addressText === 'string' ? statedPlaceAddress(ed.addressText) : null
  const venueAddress = typeof venue?.addressText === 'string' ? statedPlaceAddress(venue.addressText) : null
  const address = (eventAddress && isStreetAddress(eventAddress) ? eventAddress : null)
    ?? (venueAddress && isStreetAddress(venueAddress) ? venueAddress : null)
    ?? eventAddress
    ?? venueAddress
  const eventPin = pair(ed.lat, ed.lng)
  const venuePin = venue ? pair(venue.lat, venue.lng) : null
  const coords = (isStreetAddress(venueAddress) ? venuePin : null)
    ?? (isStreetAddress(eventAddress) ? eventPin : null)
    ?? eventPin
    ?? venuePin
  const extra = typeof ed.locationAdditionalInformation === 'string' ? ed.locationAdditionalInformation : null
  const venueLabel = typeof venue?.name === 'string' ? venue.name : ''
  const suburbName = typeof (ed.eventSuburb as { name?: unknown } | null)?.name === 'string'
    ? String((ed.eventSuburb as { name: string }).name)
    : ''
  const online = /^(online|virtual)$/i.test(venueLabel.trim())
    || /^(online|virtual)$/i.test(suburbName.trim())
    || isConnectPlaceholder(eventAddress)
    || isConnectPlaceholder(venueAddress)
  if (online) return [{ attendance: 'online', rank: 95 }]
  const name = venueLabel || extra
  if (!address && !coords && !name) return []
  return [{
    venueName: name,
    address: address ?? null,
    lat: coords?.lat,
    lng: coords?.lng,
    rank: 90,
  }]
}

function eventbriteParts(html: string): Part[] {
  const marker = 'window.__SERVER_DATA__ = '
  const i = html.indexOf(marker)
  if (i < 0) return []
  const rest = html.slice(i + marker.length)
  const end = rest.search(/;\s*(?:\n|<)/)
  let data: unknown
  try { data = JSON.parse(end > 0 ? rest.slice(0, end) : rest.slice(0, 500_000)) } catch { return [] }
  const found: Part[] = []
  const visit = (node: unknown, depth: number) => {
    if (!node || depth > 6 || found.length > 4) return
    if (Array.isArray(node)) {
      node.slice(0, 8).forEach((item) => visit(item, depth + 1))
      return
    }
    if (typeof node !== 'object') return
    const o = node as Record<string, unknown>
    const address = typeof o.localized_address_display === 'string'
      ? o.localized_address_display
      : (o.address && typeof o.address === 'object' && typeof (o.address as { localized_address_display?: unknown }).localized_address_display === 'string'
        ? (o.address as { localized_address_display: string }).localized_address_display
        : null)
    const addrObj = o.address && typeof o.address === 'object' ? o.address as Record<string, unknown> : null
    const coords = pair(o.latitude ?? addrObj?.latitude ?? (o.location as { latitude?: unknown } | undefined)?.latitude, o.longitude ?? addrObj?.longitude ?? (o.location as { longitude?: unknown } | undefined)?.longitude)
    const name = typeof o.name === 'string' ? o.name : null
    if (isStreetAddress(address) || (coords && name)) {
      found.push({ venueName: name, address, lat: coords?.lat, lng: coords?.lng, attendance: o.is_online_event === true ? 'online' : undefined, rank: 80 })
    }
    for (const key of ['venue', 'primary_venue', 'location', 'event', 'address']) {
      if (key in o) visit(o[key], depth + 1)
    }
  }
  visit(data, 0)
  return found
}

/** Ticketmaster / Oztix style JSON blobs that name a venue next to an address. */
function embeddedVenueParts(html: string): Part[] {
  const parts: Part[] = []
  const venue = html.match(/"venue"\s*:\s*(\{[\s\S]{0,1500}?\})/i)
  if (venue) {
    try {
      const o = JSON.parse(venue[1]) as Record<string, unknown>
      const address = venueAddressFields(o)
      const coords = pair(
        (o.location as { latitude?: unknown } | undefined)?.latitude ?? o.latitude ?? o.lat,
        (o.location as { longitude?: unknown } | undefined)?.longitude ?? o.longitude ?? o.lng,
      )
      if (address || coords) parts.push({ venueName: typeof o.name === 'string' ? o.name : null, address, lat: coords?.lat, lng: coords?.lng, rank: 75 })
    } catch { /* not a closed JSON object */ }
  }
  const oztixName = html.match(/"VenueName"\s*:\s*"((?:\\.|[^"\\])*)"/)
  const oztixAddress = html.match(/"Address"\s*:\s*"((?:\\.|[^"\\])*)"/)
  const oztixLat = html.match(/"(?:Latitude|VenueLatitude)"\s*:\s*"?(-?\d+(?:\.\d+)?)/)
  const oztixLng = html.match(/"(?:Longitude|VenueLongitude)"\s*:\s*"?(-?\d+(?:\.\d+)?)/)
  if (oztixName || oztixAddress) {
    const coords = pair(oztixLat?.[1], oztixLng?.[1])
    parts.push({
      venueName: oztixName ? decode(oztixName[1]) : null,
      address: oztixAddress ? decode(oztixAddress[1]) : null,
      lat: coords?.lat,
      lng: coords?.lng,
      rank: 75,
    })
  }
  return parts
}

function venueAddressFields(o: Record<string, unknown>): string | null {
  const addr = o.address && typeof o.address === 'object' ? o.address as Record<string, unknown> : null
  if (!addr) return typeof o.address === 'string' ? clean(o.address) : null
  if (typeof addr.localized_address_display === 'string') return clean(addr.localized_address_display)
  const line = [addr.line1, addr.streetAddress, addr.line2].find((v) => typeof v === 'string') as string | undefined
  const locality = [addr.locality, addr.city, (addr.city as { name?: unknown } | undefined)?.name].find((v) => typeof v === 'string') as string | undefined
  const region = typeof addr.region === 'string' ? addr.region : (typeof (addr.state as { stateCode?: unknown } | undefined)?.stateCode === 'string' ? (addr.state as { stateCode: string }).stateCode : '')
  const post = addr.postalCode != null ? String(addr.postalCode) : (addr.postCode != null ? String(addr.postCode) : '')
  return formatPostal({ streetAddress: line, addressLocality: locality, addressRegion: region, postalCode: post })
}

function metaParts(html: string): Part[] {
  const lat = metaContent(html, 'place:location:latitude') ?? metaContent(html, 'og:latitude')
  const lng = metaContent(html, 'place:location:longitude') ?? metaContent(html, 'og:longitude')
  const geo = metaContent(html, 'geo.position')
  const fromGeo = geo?.match(/(-?\d+(?:\.\d+)?)\s*[;,]\s*(-?\d+(?:\.\d+)?)/)
  const coords = pair(lat, lng) ?? (fromGeo ? pair(fromGeo[1], fromGeo[2]) : null)
  const street = metaContent(html, 'og:street-address') ?? metaContent(html, 'place:location:street-address')
  const locality = metaContent(html, 'og:locality') ?? metaContent(html, 'place:location:locality')
  const region = metaContent(html, 'og:region') ?? metaContent(html, 'place:location:region')
  const post = metaContent(html, 'og:postal-code') ?? metaContent(html, 'place:location:postal-code')
  const address = formatPostal({ streetAddress: street, addressLocality: locality, addressRegion: region, postalCode: post })
  if (!coords && !address) return []
  return [{ address, lat: coords?.lat, lng: coords?.lng, rank: 50 }]
}

function metaContent(html: string, key: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const tag of tags) {
    if (!new RegExp(`(?:property|name|itemprop)\\s*=\\s*["']${escaped}["']`, 'i').test(tag)) continue
    const content = tag.match(/content\s*=\s*["']([^"']+)["']/i)
    if (content?.[1]) return decode(content[1])
  }
  return null
}

function mapParts(html: string, pageUrl: string): Part[] {
  const text = `${html}\n${pageUrl}`
  const patterns = [
    /(?:query|q)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    const coords = m ? pair(m[1], m[2]) : null
    if (coords) return [{ lat: coords.lat, lng: coords.lng, rank: 40 }]
  }
  return []
}

function visibleAddress(html: string): string | null {
  const text = decode(html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
  const re = /\b\d{1,5}[a-z]?(?:\/\d{1,5})?\s+[A-Za-z0-9][A-Za-z0-9'’. -]{1,50}?\b(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Parade|Pde|Lane|Ln|Place|Pl|Terrace|Tce|Crescent|Cres|Court|Ct|Way|Boulevard|Blvd|Highway|Hwy|Close|Circuit)\b\.?(?:,\s*[^,]{2,40})?(?:,?\s*(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b(?:\s+\d{4})?)?/gi
  let best: { at: number; value: string } | null = null
  const lower = text.toLowerCase()
  for (const m of text.matchAll(re)) {
    const value = clean(m[0])
    if (!isStreetAddress(value) || m.index == null) continue
    const before = lower.slice(Math.max(0, m.index - 90), m.index)
    if (!/\b(?:location|address|venue)\b/.test(before)) continue
    if (!best || m.index < best.at) best = { at: m.index, value }
  }
  return best?.value ?? null
}
