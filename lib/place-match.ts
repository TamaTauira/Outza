/**
 * Place comparison for duplicate detection.
 * A shared street can be the same event. A shared suburb is not.
 */
import { suburbFromAddress } from '@/lib/cities'
import { normalizeVenue, similarity } from '@/lib/quality'
import { distanceKm } from '@/lib/travel'

const SUFFIX: Record<string, string> = {
  street: 'street', st: 'street',
  road: 'road', rd: 'road',
  avenue: 'avenue', ave: 'avenue',
  drive: 'drive', dr: 'drive',
  parade: 'parade', pde: 'parade',
  lane: 'lane', ln: 'lane',
  place: 'place', pl: 'place',
  terrace: 'terrace', tce: 'terrace',
  crescent: 'crescent', cres: 'crescent',
  court: 'court', ct: 'court',
  boulevard: 'boulevard', blvd: 'boulevard',
  highway: 'highway', hwy: 'highway',
  esplanade: 'esplanade',
  grove: 'grove',
  close: 'close',
  way: 'way',
}

const SUFFIX_RE = Object.keys(SUFFIX).sort((a, b) => b.length - a.length).join('|')

export function foldPlace(value?: string | null): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Street names in an address or a venue line. "Llankelly Pl" and "300 Barangaroo Ave" both qualify. */
export function streetPhrases(value?: string | null): string[] {
  const text = foldPlace(value)
  if (!text) return []
  const re = new RegExp(`\\b([a-z0-9]+(?:\\s+[a-z0-9]+){0,3})\\s+(${SUFFIX_RE})\\b`, 'g')
  const out = new Set<string>()
  for (const match of text.matchAll(re)) {
    const rawName = match[1]
      .replace(/^\d+[a-z]?\s+/, '')
      .replace(/\b\d+[a-z]?\b/g, ' ')
      .replace(/\b(the|and|shop|level|unit|suite)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!rawName || rawName.length < 3) continue
    const suffix = SUFFIX[match[2]]
    if (!suffix) continue
    out.add(`${rawName} ${suffix}`)
  }
  return [...out]
}

export function sharesStreet(
  a: { venueName?: string | null; address?: string | null },
  b: { venueName?: string | null; address?: string | null },
): boolean {
  const left = new Set([...streetPhrases(a.venueName), ...streetPhrases(a.address)])
  if (!left.size) return false
  for (const phrase of [...streetPhrases(b.venueName), ...streetPhrases(b.address)]) {
    if (left.has(phrase)) return true
  }
  return false
}

/** A venue line that is only a street, such as "Llankelly Pl" or "300 Barangaroo Avenue". */
export function isStreetLabel(name?: string | null): boolean {
  const phrases = streetPhrases(name)
  if (!phrases.length) return false
  let rest = ` ${foldPlace(name)} `
  for (const phrase of phrases) {
    const namePart = phrase.slice(0, phrase.lastIndexOf(' ')).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (!namePart) continue
    rest = rest.replace(new RegExp(`\\b${namePart}\\s+(?:${SUFFIX_RE})\\b`, 'g'), ' ')
  }
  rest = rest
    .replace(/\b\d+[a-z]?\b/g, ' ')
    .replace(/\b(the|and|shop|level|unit|suite)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return rest.length === 0
}

/** A street, a TBA, or a venue named only as the suburb in its address. A named room is not weak. */
export function isWeakVenueName(name?: string | null, address?: string | null): boolean {
  const raw = (name ?? '').trim()
  if (!raw || /^(tba|tbc|venue tba|venue tbc)$/i.test(raw)) return true
  if (isStreetLabel(raw)) return true
  const suburb = suburbFromAddress(address)
  if (!suburb) return false
  return foldPlace(raw) === foldPlace(suburb)
}

const SHOW_NOISE = /\b(free entry|free event|early bird|general admission|owners admission|owner admission|front row|door sales?|all ages|sold out|selling fast|booked out|tickets? left|spaces? left|plus one|2 for 1|two for 1)\b/g
const MONTHS = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/g

/**
 * Public title with ticket-tier, scarcity and date-edition wording removed.
 * "GA" and "3 tickets left" do not make a second event. A different show name still does.
 */
/** Like normalizeTitle, but a long "| subtitle" stays so "two show pass" is not thrown away. */
function foldShowTitle(value: string): string {
  return value
    .normalize('NFKD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(live|tickets?|presents?|the|and|tour|australian|australia|world|show|concert|official|20\d\d)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function showTitle(value?: string | null): string {
  const pre = (value ?? '')
    .replace(/\b\d+\s*x\s+tickets?\s+left\b/gi, ' ')
    .replace(/\b\d+\s+tickets?\s+left\b/gi, ' ')
    .replace(/\btickets?\s+left\b/gi, ' ')
    .replace(/\bspaces?\s+left\b/gi, ' ')
  return foldShowTitle(pre)
    .replace(/\b\d+\s*x\b/g, ' ')
    .replace(SHOW_NOISE, ' ')
    .replace(MONTHS, ' ')
    .replace(/\b(vip|ga|cancelled|postponed|edition)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Same title once a "(free entry)" suffix, a ticket tier, or a scarcity note is ignored. */
export function equivalentTitles(a?: string | null, b?: string | null): boolean {
  const left = showTitle(a)
  const right = showTitle(b)
  return !!left && left === right
}

/**
 * "Hoodoo Gurus" is the same show as "Hoodoo Gurus Rewind Tour".
 * A support act named inside someone else's bill is not.
 */
export function titleIsTourOf(a?: string | null, b?: string | null): boolean {
  const left = showTitle(a)
  const right = showTitle(b)
  if (!left || !right || left === right) return false
  const [short, long] = left.length <= right.length ? [left, right] : [right, left]
  const rawLong = (left.length <= right.length ? b : a) ?? ''
  if (!long.startsWith(`${short} `)) return false
  const shortTokens = short.split(' ').filter((word) => word.length > 1)
  const oneArtist = shortTokens.length === 1 && shortTokens[0].length >= 4
  if (shortTokens.length < 2 && !oneArtist) return false
  const rest = long.slice(short.length)
  if (/\b(pass|session|matinee|encore|ages)\b/.test(rest)) return false
  // showTitle removes "tour" and "world" before this comparison, so a subtitle
  // such as "BRITPOP WORLD TOUR" has to be read from the original title.
  if (oneArtist) return /\btour\b/i.test(rawLong)
  return /\b(tour|live|world|rewind|unplugged|presents)\b/i.test(rawLong)
}

function venueKey(value?: string | null): string {
  return normalizeVenue(value ?? '')
    .replace(/\bst\b/g, 'street')
    .replace(/\brd\b/g, 'road')
    .replace(/\bave\b/g, 'avenue')
    .replace(/\bpl\b/g, 'place')
    .replace(/\s+/g, ' ')
    .trim()
}

export function venuesMatch(a?: string | null, b?: string | null): boolean {
  const left = venueKey(a)
  const right = venueKey(b)
  if (!left || !right) return false
  if (left === right) return true
  if (similarity(left, right) >= 0.85) return true
  const [short, long] = left.length <= right.length ? [left, right] : [right, left]
  return short.length >= 8 && ` ${long} `.includes(` ${short} `)
}

/**
 * One row names only the suburb and the other names the room there.
 * Two real venues in the same suburb stay apart.
 */
export function suburbLabelMatch(
  a: { venueName?: string | null; address?: string | null },
  b: { venueName?: string | null; address?: string | null },
): boolean {
  const weakA = isWeakVenueName(a.venueName, a.address)
  const weakB = isWeakVenueName(b.venueName, b.address)
  if (weakA === weakB) return false
  const placeA = foldPlace(suburbFromAddress(a.address) || (weakA ? a.venueName : ''))
  const placeB = foldPlace(suburbFromAddress(b.address) || (weakB ? b.venueName : ''))
  return !!placeA && placeA === placeB
}

/** About 150m. A shared pin this close is the same doorway. */
export function pinsNear(a: { lat?: number | null; lng?: number | null }, b: { lat?: number | null; lng?: number | null }): boolean {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return false
  if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng) || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return false
  return distanceKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }) <= 0.15
}
