import { CITIES, CITY_NAMES, KNOWN_CITY_DEFS, REGION_MEMBERS } from '@/lib/cities'
import { areaGroupsFor } from '@/lib/categories'
import { coordsFitCity, distanceKm } from '@/lib/travel'

/**
 * Smart default from the visitor's IP, as located by Vercel's edge headers
 * (x-vercel-ip-city / -country / -latitude / -longitude). This is IP
 * geolocation only: no device permission prompt, no third-party lookup, and
 * the address itself is never stored — only the resolved board default is.
 *
 * The result is a DEFAULT, consulted by the client only when the person has
 * no stored selection (see city-pref precedence). It resolves to a catalogue
 * board plus, on a region board, the area the visitor is actually in, so a
 * Newcastle visitor opens the Sydney & the NSW Coast board already narrowed
 * to Newcastle & the Hunter instead of the whole coast.
 */
export interface EdgeIpHeaders {
  city?: string | null
  country?: string | null
  latitude?: string | null
  longitude?: string | null
}

export interface EdgeLocation {
  /** Catalogue city whose board opens. */
  city: string
  /** Area group label to pre-select on that board, or null for no narrowing. */
  area: string | null
}

function decodeCityName(raw: string | null | undefined): string {
  if (!raw) return ''
  try {
    return decodeURIComponent(raw).trim()
  } catch {
    return raw.trim()
  }
}

/** Where a known non-catalogue place (Newcastle, Wollongong) belongs: its board and area group. */
function locationForKnownPlace(place: string): EdgeLocation | null {
  for (const [board, members] of Object.entries(REGION_MEMBERS)) {
    if (!members.includes(place)) continue
    const group = areaGroupsFor(board).find((g) => g.storedCities.includes(place) || g.centre === place)
    return { city: board, area: group?.label ?? null }
  }
  // Area-only places (Wollongong) are not region members; they are the centre
  // of an area group on their board.
  for (const board of CITY_NAMES) {
    const group = areaGroupsFor(board).find((g) => g.centre === place)
    if (group) return { city: board, area: group.label }
  }
  return null
}

function locationForCoords(lat: number, lng: number): EdgeLocation | null {
  // Folded-in areas first, measured against their own centres exactly as
  // event-to-area matching does (matchesAreaGroup): a point in Newcastle is
  // in Newcastle & the Hunter even though its board is Sydney. The board's
  // home group is skipped — landing there is just the board, unnarrowed.
  for (const board of CITY_NAMES) {
    for (const group of areaGroupsFor(board)) {
      if (!group.centre || group.centre === board) continue
      if (coordsFitCity(lat, lng, group.centre)) return { city: board, area: group.label }
    }
  }
  // The nearest catalogue city the point actually fits (same radius test the
  // board guard uses). A point that fits no listed city — the interior, say —
  // maps nowhere rather than to a far-away guess.
  let best: string | null = null
  let bestKm = Infinity
  for (const def of CITIES) {
    if (!coordsFitCity(lat, lng, def.name)) continue
    const km = distanceKm({ lat, lng }, { lat: def.lat, lng: def.lng })
    if (km < bestKm) { best = def.name; bestKm = km }
  }
  return best ? { city: best, area: null } : null
}

/**
 * Resolve the edge headers to a board default, or null when they say nothing
 * usable (missing headers outside Vercel, a non-Australian address, or a
 * location that maps to no listed city). Null always means "keep the current
 * behaviour" — the caller falls back to the plain Sydney default, silently.
 */
export function resolveEdgeLocation(headers: EdgeIpHeaders): EdgeLocation | null {
  const country = (headers.country ?? '').trim().toUpperCase()
  if (country && country !== 'AU') return null

  const name = decodeCityName(headers.city)
  if (name) {
    const known = KNOWN_CITY_DEFS.find((c) => c.name.toLowerCase() === name.toLowerCase())
    if (known) {
      if (CITY_NAMES.includes(known.name)) return { city: known.name, area: null }
      const placed = locationForKnownPlace(known.name)
      if (placed) return placed
    }
  }

  const lat = headers.latitude == null || headers.latitude === '' ? NaN : Number(headers.latitude)
  const lng = headers.longitude == null || headers.longitude === '' ? NaN : Number(headers.longitude)
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return locationForCoords(lat, lng)
  }
  return null
}
