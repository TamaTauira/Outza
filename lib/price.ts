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
    // A money object's `value` is minor units — that is Eventbrite's contract
    // (`value` is cents, `major_value` is the decimal amount). Dividing only
    // when a currency happened to accompany it let a bare { value: 79900 }
    // through as $79,900 instead of $799.
    if (o.value != null && o.major_value == null) {
      const n = Number(o.value)
      return Number.isFinite(n) ? Math.round(n) / 100 : null
    }
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

export type TicketClassAmount = {
  /** The class name as the source published it ("Adult", "Group of 10", …), when it published one. */
  name?: string | null
  amount: number
  /** Admissions the class price covers, when the source states it. */
  quantity?: number | null
}

const BULK_CLASS_NAME = /\b(groups?|corporate|team|bundle|family|couples?)\b|\btable\s+of\s+\d+|\bbooth\s+for\s+\d+|\bfor\s+\d+\b|\b\d+\s*(?:people|persons|guests|adults|tickets|pack)\b|\bpack\s+of\s+\d+|\badmits\s+\d+|\bdouble\s+pass\b|\bx\s*\d+\b/i

/** True when a ticket class is plainly priced for more than one admission: a stated quantity over 1, or a group / corporate / table / bundle name. */
export function isBulkTicketClass(cls: TicketClassAmount): boolean {
  if (typeof cls.quantity === 'number' && Number.isFinite(cls.quantity) && cls.quantity > 1) return true
  const name = (cls.name ?? '').trim()
  return !!name && BULK_CLASS_NAME.test(name)
}

/**
 * The headline range from ticket classes. A bulk/group total — a table, a
 * corporate tier, a 30-ticket bundle — is not a per-person price, so it never
 * sets the range while any single-admission class exists. The classes stay in
 * the data; only the headline range ignores them. When every class is bulk,
 * the range falls back to all of them rather than showing nothing.
 */
export function priceFromTicketClasses(classes: TicketClassAmount[]): PriceRead {
  const usable = classes.filter((cls) => Number.isFinite(cls.amount) && cls.amount >= 0)
  if (!usable.length) return UNKNOWN
  const singles = usable.filter((cls) => !isBulkTicketClass(cls))
  const pool = singles.length ? singles : usable
  return priceFromAmounts(Math.min(...pool.map((cls) => cls.amount)), Math.max(...pool.map((cls) => cls.amount)))
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
  const parsed = rows.map((row) => ({ label: String(row?.label ?? ''), read: readPrice(row?.price) }))
  // A bulk-labelled row (a group or corporate total) never sets the headline
  // range while a single-admission row exists.
  const singles = parsed.filter((row) => !isBulkTicketClass({ name: row.label }))
  const pool = singles.length ? singles : parsed
  const nums: number[] = []
  let fromOnly = false
  let sawFree = false
  for (const row of pool) {
    const r = row.read
    if (r.isFree) { sawFree = true; nums.push(0) }
    if (r.min != null) nums.push(r.min)
    if (r.max != null && r.max !== r.min) nums.push(r.max)
    if (/\b(from|starting)\b/i.test(row.label) && r.min != null && r.min === r.max) fromOnly = true
  }
  if (!nums.length) return sawFree ? FREE : UNKNOWN
  const distinct = new Set(nums)
  return priceFromAmounts(Math.min(...nums), Math.max(...nums), { fromOnly: fromOnly && distinct.size === 1 })
}

export interface StoredPriceResolution {
  kind: 'free' | 'paid' | 'unknown'
  min: number | null
  max: number | null
  fromOnly: boolean
  /** A free class sits alongside paid classes. */
  hasFree: boolean
  /** Real amounts were read but breached the publishable bound. */
  suppressed: boolean
  flagged: boolean
  /** A non-numeric price worth showing as written ("Gold coin donation") when nothing numeric resolved. */
  verbatim: string | null
}

const NO_AMOUNTS = { min: null, max: null, fromOnly: false, hasFree: false, suppressed: false, flagged: false, verbatim: null } as const

/**
 * The one resolution every surface reads a stored price through — board,
 * list, event page, and the summaries baked into API payloads. The numeric
 * columns are what the price filters use, so when the string and the columns
 * disagree, the columns win; when they agree, the string's "From" and
 * free-class nuance is kept. A positive amount anywhere beats the isFree
 * flag. Before this, the board preferred the string and the event page the
 * columns, so the two could show different prices for the same row.
 */
export function resolveStoredPrice(
  isFree: boolean,
  price: string | null,
  priceMin?: number | null,
  priceMax?: number | null,
): StoredPriceResolution {
  const stringRead = readPrice(price)
  const lo = priceMin != null && Number.isFinite(priceMin) ? priceMin : null
  const hi = priceMax != null && Number.isFinite(priceMax) ? priceMax : null
  const columnRead = lo != null || hi != null ? priceFromAmounts(lo ?? hi!, hi ?? lo!) : null
  const definitive = (read: PriceRead | null): boolean => !!read && (read.isFree || read.min != null || read.suppressed === true)
  let chosen: PriceRead | null = null
  if (definitive(columnRead)) {
    chosen = columnRead
    // Same amounts either way: the string carries the "From" / free-class nuance.
    if (!columnRead!.suppressed && stringRead.min != null && stringRead.min === columnRead!.min && stringRead.max === columnRead!.max) {
      chosen = stringRead
    }
  } else if (definitive(stringRead)) {
    chosen = stringRead
  }
  if (chosen) {
    if (chosen.isFree) return { ...NO_AMOUNTS, kind: 'free' }
    if (chosen.suppressed) return { ...NO_AMOUNTS, kind: 'unknown', suppressed: true }
    return {
      kind: 'paid',
      min: chosen.min,
      max: chosen.max,
      fromOnly: chosen.fromOnly,
      hasFree: chosen.hasFree === true,
      suppressed: false,
      flagged: chosen.flagged === true,
      verbatim: null,
    }
  }
  if (isFree) return { ...NO_AMOUNTS, kind: 'free' }
  if (stringRead.suppressed || columnRead?.suppressed) return { ...NO_AMOUNTS, kind: 'unknown', suppressed: true }
  const verbatim = price && !UNKNOWN_LABEL.test(price.trim()) ? price.trim() : null
  return { ...NO_AMOUNTS, kind: verbatim ? 'paid' : 'unknown', verbatim }
}

/** Board/card label. Resolves the stored string and columns through the one shared precedence. */
export function formatPrice(
  isFree: boolean,
  price: string | null,
  priceMin?: number | null,
  priceMax?: number | null,
): { prefix: string; value: string; kind: 'free' | 'paid' | 'unknown'; hasFree: boolean } {
  const r = resolveStoredPrice(isFree, price, priceMin, priceMax)
  if (r.kind === 'free') return { prefix: '', value: 'Free', kind: 'free', hasFree: false }
  if (r.kind === 'unknown') return { prefix: '', value: 'See website', kind: 'unknown', hasFree: false }
  if (r.verbatim) return { prefix: '', value: r.verbatim, kind: 'paid', hasFree: false }
  const min = r.min!
  const max = r.max ?? min
  if (max === min) {
    if (r.fromOnly) return { prefix: 'From', value: moneyText(min), kind: 'paid', hasFree: r.hasFree }
    return { prefix: '', value: moneyText(min), kind: 'paid', hasFree: r.hasFree }
  }
  if (min === 0) return { prefix: 'From', value: moneyText(max), kind: 'paid', hasFree: true }
  return { prefix: '', value: `${moneyText(min)}–${moneyText(max)}`, kind: 'paid', hasFree: r.hasFree }
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
