/**
 * Place comparison for duplicate detection.
 * A shared street can be the same event. A shared suburb is not.
 */
import { suburbFromAddress } from '@/lib/cities'
import { normalizeTitle, normalizeVenue, similarity } from '@/lib/quality'

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

/** Same title once a "(free entry)" suffix is ignored. Extra words still count as a different title. */
export function equivalentTitles(a?: string | null, b?: string | null): boolean {
  const left = titleKey(a)
  const right = titleKey(b)
  return !!left && left === right
}

function titleKey(value?: string | null): string {
  return normalizeTitle(value ?? '')
    .replace(/\bfree entry\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function venuesMatch(a?: string | null, b?: string | null): boolean {
  const left = normalizeVenue(a ?? '')
  const right = normalizeVenue(b ?? '')
  if (!left || !right) return false
  if (left === right) return true
  return similarity(left, right) >= 0.85
}
