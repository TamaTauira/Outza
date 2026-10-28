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
}

const FREE: PriceRead = { price: 'Free', isFree: true, min: 0, max: 0, fromOnly: false }
const UNKNOWN: PriceRead = { price: null, isFree: false, min: null, max: null, fromOnly: false }

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
  const fromOnly = !!opts?.fromOnly && a === b
  const price = a === 0 ? `Free – ${moneyText(b)}` : fromOnly ? `From ${moneyText(a)}` : a === b ? moneyText(a) : `${moneyText(a)} – ${moneyText(b)}`
  return { price, isFree: false, min: a, max: b, fromOnly }
}

function isClearlyFree(text: string): boolean {
  if (extractAmounts(text).some((n) => n > 0)) return false
  return /\b(free|gratis|complimentary|no charge|no cost)\b/i.test(text) || /^(?:aud\s*)?\$?\s*0(?:\.0+)?$/i.test(text.trim())
}

/** Parse a price string, number, or money/range object. `isFreeHint` forces Free (a source said the event is free). */
export function readPrice(raw: unknown, isFreeHint = false): PriceRead {
  if (isFreeHint) return FREE
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
): { prefix: string; value: string; kind: 'free' | 'paid' | 'unknown' } {
  const r = readPrice(price, isFree)
  let min = r.min
  let max = r.max
  let fromOnly = r.fromOnly
  if (r.isFree) return { prefix: '', value: 'Free', kind: 'free' }
  if (min == null && priceMin != null && Number.isFinite(priceMin)) {
    min = priceMin
    max = priceMax != null && Number.isFinite(priceMax) ? priceMax : priceMin
    fromOnly = false
  }
  if (min == null) {
    if (price && !UNKNOWN_LABEL.test(price.trim())) return { prefix: '', value: price.trim(), kind: 'paid' }
    return { prefix: '', value: 'Price TBA', kind: 'unknown' }
  }
  if (max == null || max === min) {
    if (min === 0) return { prefix: '', value: 'Free', kind: 'free' }
    if (fromOnly) return { prefix: 'from', value: moneyText(min), kind: 'paid' }
    return { prefix: '', value: moneyText(min), kind: 'paid' }
  }
  if (min === 0) return { prefix: 'free –', value: moneyText(max), kind: 'paid' }
  return { prefix: '', value: `${moneyText(min)}–${moneyText(max)}`, kind: 'paid' }
}
