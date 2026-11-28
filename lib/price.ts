/**
 * Turns source price values into a display string and a numeric range.
 * Never invents an amount: unknown stays unknown.
 */

export interface PriceRead {
  price: string | null
  isFree: boolean
  min: number | null
  max: number | null
  fromOnly: boolean
  /** A free class sits alongside paid classes (the range starts at $0 but does not end there). */
  hasFree?: boolean
  /** Real amounts were read but breached the publishable bound and were suppressed, not merely unknown. */
  suppressed?: boolean
  /** The range reaches the internal review band (from $1,000) without breaching the bound. */
  flagged?: boolean
}

const FREE: PriceRead = { price: 'Free', isFree: true, min: 0, max: 0, fromOnly: false, hasFree: false, suppressed: false, flagged: false }
const UNKNOWN: PriceRead = { price: null, isFree: false, min: null, max: null, fromOnly: false, hasFree: false, suppressed: false, flagged: false }
const SUPPRESSED: PriceRead = { price: null, isFree: false, min: null, max: null, fromOnly: false, hasFree: false, suppressed: true, flagged: false }

/**
 * Per-ticket sanity bound for anything VibePeep displays or stores. Ranges
 * reaching $1,000 are flagged for internal review; a range past $2,500 is not
 * published at all — pooled group totals and unconverted cents land there, and
 * a suppressed price beats an invented or clamped one. Enforced here, at the
 * single choke point every feed and reader funnels through, and again at
 * display time so already-stored rows are covered without a bulk update.
 */
export const PRICE_FLAG_ABOVE = 1000
export const PRICE_SUPPRESS_ABOVE = 2500

export type PriceOutlier = 'suppressed' | 'flagged' | null

/** The outlier level of a numeric range, if any. Compares the largest amount: it is the one that would be displayed. */
export function priceOutlier(min: number | null, max: number | null): PriceOutlier {
  const hi = max ?? min
  if (hi == null || !Number.isFinite(hi)) return null
  if (hi > PRICE_SUPPRESS_ABOVE) return 'suppressed'
  if (hi >= PRICE_FLAG_ABOVE) return 'flagged'
  return null
}

/** Shown wherever a paid price is displayed: published amounts are face value unless the source says fees are included. */
export const BOOKING_FEES_NOTE = 'Booking fees may apply at checkout'

/** The fee note that travels with a displayed price, or null when no price (or a free one) is shown. */
export function priceFeeNote(kind: 'free' | 'paid' | 'unknown'): string | null {
  return kind === 'paid' ? BOOKING_FEES_NOTE : null
}

const UNKNOWN_LABEL = /^(tba|tbc|n\/?a|price tba|price tbc|see website|various|poa|price on application|unknown|coming soon|-|—|–)$/i

export function moneyText(n: number): string {
  const rounded = Math.round(n * 100) / 100
  if (Number.isInteger(rounded)) return `$${rounded}`
  return `$${rounded.toFixed(2)}`
}

/** Dollar amounts in a price string. Thousands separators are kept together; a 4-digit year is ignored when a real price sits beside it. */
export function extractAmounts(text: string): number[] {
  const cleaned = text.replace(/,(?=\d{3}(?:\D|$))/g, '')
  const out: number[] = []
  for (const m of cleaned.matchAll(/\d+(?:\.\d+)?/g)) {
    const n = Number(m[0])
    if (Number.isFinite(n)) out.push(Math.round(n * 100) / 100)
  }
  if (out.some((n) => n < 1900)) return out.filter((n) => n < 1900 || n > 2100)
  return out
}

/** One number from a scalar or a money object (Eventbrite major_value / display, or minor `value` + currency). */
export function moneyNumber(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null
  if (typeof v === 'string') {
    const amounts = extractAmounts(v)
    return amounts.length ? amounts[0] : null
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (o.major_value != null && o.major_value !== '') return moneyNumber(o.major_value)
    if (typeof o.display === 'string' && extractAmounts(o.display).length) return moneyNumber(o.display)
    if (o.amount != null && o.amount !== '') return moneyNumber(o.amount)
    // Eventbrite's `value` is minor units when currency is set and major_value is absent.
    if (o.value != null && o.currency != null && o.major_value == null) {
      const n = Number(o.value)
      return Number.isFinite(n) ? Math.round(n) / 100 : null
    }
    if (o.value != null) return moneyNumber(o.value)
    if (o.price != null && typeof o.price !== 'object') return moneyNumber(o.price)
  }
  return null
}

export function priceFromAmounts(min: number | null, max: number | null, opts?: { fromOnly?: boolean }): PriceRead {
  if (min == null && max == null) return UNKNOWN
  const lo = min ?? max!
  const hi = max ?? min!
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return UNKNOWN
  const a = Math.min(lo, hi)
  const b = Math.max(lo, hi)
  if (a === 0 && b === 0) return FREE
  if (priceOutlier(a, b) === 'suppressed') return SUPPRESSED
  const fromOnly = !!opts?.fromOnly && a === b
  // A $0 class pooled with paid classes leads with the cheapest paid amount the
  // range can stand behind — never a headline "Free" and never a "Free – $X" range.
  const price = a === 0 ? `From ${moneyText(b)}` : fromOnly ? `From ${moneyText(a)}` : a === b ? moneyText(a) : `${moneyText(a)} – ${moneyText(b)}`
  return { price, isFree: false, min: a, max: b, fromOnly, hasFree: a === 0, suppressed: false, flagged: priceOutlier(a, b) === 'flagged' }
}

function isClearlyFree(text: string): boolean {
  if (extractAmounts(text).some((n) => n > 0)) return false
  return /\b(free|gratis|complimentary|no charge|no cost)\b/i.test(text) || /^(?:aud\s*)?\$?\s*0(?:\.0+)?$/i.test(text.trim())
}

/** Parse a price string, number, or money/range object. A free hint applies when the price itself is blank or zero. A positive price wins. */
export function readPrice(raw: unknown, isFreeHint = false): PriceRead {
  const parsed = readPriceValue(raw)
  if (!isFreeHint) return parsed
  // A suppressed read had real amounts over the bound; a free hint must not
  // resurrect them as Free (the Eventbrite free-listing pass relies on this).
  if (parsed.suppressed) return parsed
  if (parsed.min != null && parsed.min > 0) return parsed
  if (parsed.max != null && parsed.max > 0) return parsed
  return FREE
}

function readPriceValue(raw: unknown): PriceRead {
  if (raw == null || raw === '') return UNKNOWN
  if (typeof raw === 'number') return priceFromAmounts(raw, raw)
  if (typeof raw === 'object') {
    if (Array.isArray(raw)) return readPriceRows(raw.map((row) => (typeof row === 'object' && row ? row as { label?: string; price?: unknown } : { price: row })))
    const o = raw as Record<string, unknown>
    const min = moneyNumber(o.minimumPrice ?? o.minPrice ?? o.min ?? o.lowPrice ?? o.priceFrom ?? o.priceMin)
    const max = moneyNumber(o.maximumPrice ?? o.maxPrice ?? o.max ?? o.highPrice ?? o.priceTo ?? o.priceMax)
    if (min != null || max != null) return priceFromAmounts(min ?? max, max ?? min, { fromOnly: min != null && max == null })
    const n = moneyNumber(o)
    if (n != null) return priceFromAmounts(n, n)
    if (typeof o.display === 'string') return readPrice(o.display)
    if (typeof o.price === 'string') return readPrice(o.price)
    return UNKNOWN
  }
  const text = String(raw).replace(/\s+/g, ' ').trim()
  if (!text || UNKNOWN_LABEL.test(text)) return UNKNOWN
  if (isClearlyFree(text)) return FREE
  let nums = extractAmounts(text)
  if (/\bfree\b/i.test(text) && nums.some((n) => n > 0) && !nums.includes(0)) nums = [0, ...nums]
  if (!nums.length) return UNKNOWN
  const distinct = new Set(nums)
  const fromOnly = /\b(from|starting(?:\s+from)?)\b/i.test(text) && distinct.size === 1
  return priceFromAmounts(Math.min(...nums), Math.max(...nums), { fromOnly })
}

/** City of Sydney `priceData` rows and similar `{ label, price }[]` lists. */
export function readPriceRows(rows: { label?: string; price?: unknown }[]): PriceRead {
  const nums: number[] = []
  let fromOnly = false
  let sawFree = false
  for (const row of rows) {
    const r = readPrice(row?.price)
    if (r.isFree) { sawFree = true; nums.push(0) }
    if (r.min != null) nums.push(r.min)
    if (r.max != null && r.max !== r.min) nums.push(r.max)
    if (/\b(from|starting)\b/i.test(String(row?.label ?? '')) && r.min != null && r.min === r.max) fromOnly = true
  }
  if (!nums.length) return sawFree ? FREE : UNKNOWN
  const distinct = new Set(nums)
  return priceFromAmounts(Math.min(...nums), Math.max(...nums), { fromOnly: fromOnly && distinct.size === 1 })
}

/** Board/card label. Uses the price string first, then numeric columns already stored on the event. */
export function formatPrice(
  isFree: boolean,
  price: string | null,
  priceMin?: number | null,
  priceMax?: number | null,
): { prefix: string; value: string; kind: 'free' | 'paid' | 'unknown'; hasFree: boolean } {
  const r = readPrice(price, isFree)
  let min = r.min
  let max = r.max
  let fromOnly = r.fromOnly
  let hasFree = r.hasFree === true
  if (r.isFree) return { prefix: '', value: 'Free', kind: 'free', hasFree: false }
  if (min == null && priceMin != null && Number.isFinite(priceMin)) {
    min = priceMin
    max = priceMax != null && Number.isFinite(priceMax) ? priceMax : priceMin
    fromOnly = false
    hasFree = min === 0 && max != null && max > min
  }
  if (min == null) {
    // Amounts were read but suppressed by the sanity bound: never fall back to
    // printing the raw string.
    if (r.suppressed) return { prefix: '', value: 'See website', kind: 'unknown', hasFree: false }
    if (price && !UNKNOWN_LABEL.test(price.trim())) return { prefix: '', value: price.trim(), kind: 'paid', hasFree: false }
    return { prefix: '', value: 'See website', kind: 'unknown', hasFree: false }
  }
  // The bound is enforced again here so rows stored before it existed (their
  // numeric columns included) stop showing an out-of-bound price.
  if (priceOutlier(min, max) === 'suppressed') return { prefix: '', value: 'See website', kind: 'unknown', hasFree: false }
  if (max == null || max === min) {
    if (min === 0) return { prefix: '', value: 'Free', kind: 'free', hasFree: false }
    if (fromOnly) return { prefix: 'From', value: moneyText(min), kind: 'paid', hasFree }
    return { prefix: '', value: moneyText(min), kind: 'paid', hasFree }
  }
  if (min === 0) return { prefix: 'From', value: moneyText(max), kind: 'paid', hasFree: true }
  return { prefix: '', value: `${moneyText(min)}–${moneyText(max)}`, kind: 'paid', hasFree }
}

/** One line for a list row or board card. Missing prices stay “See website”. */
export function listPriceLabel(
  isFree: boolean,
  price: string | null,
  priceMin?: number | null,
  priceMax?: number | null,
): { text: string; kind: 'free' | 'paid' | 'unknown'; hasFree: boolean } {
  const parsed = formatPrice(isFree, price, priceMin, priceMax)
  if (parsed.kind === 'free') return { text: 'Free', kind: 'free', hasFree: false }
  if (parsed.kind === 'unknown') return { text: 'See website', kind: 'unknown', hasFree: false }
  return { text: [parsed.prefix, parsed.value].filter(Boolean).join(' '), kind: 'paid', hasFree: parsed.hasFree }
}
