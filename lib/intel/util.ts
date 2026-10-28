// Pure helpers for OUTZA Intelligence (no DB access; unit-tested).
import { createHash } from 'crypto'

/** RFC-4180-ish CSV parser (handles quoted fields with commas/quotes/newlines). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = [], cur = '', q = false
  const s = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++ } else q = false }
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cur); cur = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else cur += c
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  const [head, ...body] = rows
  if (!head) return []
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

export const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

export async function fetchRetry(url: string, init: RequestInit = {}, attempts = 3, timeoutMs = 90_000): Promise<{ res: Response; attempts: number }> {
  let last: unknown
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' })
      if (res.ok) return { res, attempts: i }
      last = new Error(`HTTP ${res.status} from ${new URL(url).host}`)
      if (res.status >= 400 && res.status < 500 && res.status !== 429) break
    } catch (e) { last = e }
    if (i < attempts) await new Promise((r) => setTimeout(r, 1500 * i * i))
  }
  throw last instanceof Error ? last : new Error(String(last))
}

/** Station names in TfNSW files: collapse whitespace and strip mode suffixes so usage joins to locations. */
export function normStation(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').replace(/\b(station|light rail|metro|stop)\b/g, '').replace(/\s+/g, ' ').trim()
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

/** Percentage change; null when either value is missing or the base is zero. */
export function pctChange(now?: number | null, base?: number | null) {
  if (now == null || base == null || base === 0) return null
  return ((now - base) / Math.abs(base)) * 100
}

/** Share-point difference between a local and a benchmark share (both in %). */
export const ptsDiff = (local?: number | null, bench?: number | null) => (local == null || bench == null ? null : local - bench)

/** Parse "68.4 million" / "$35.1 billion" into a plain number. */
export function parseMagnitude(s: string): number | null {
  const m = s.replace(/,/g, '').match(/\$?\s*([\d.]+)\s*(million|billion|thousand|m|b|k)?/i)
  if (!m) return null
  const n = parseFloat(m[1]); if (!isFinite(n)) return null
  const u = (m[2] ?? '').toLowerCase()
  return n * (u.startsWith('b') ? 1e9 : u.startsWith('m') ? 1e6 : u.startsWith('t') || u === 'k' ? 1e3 : 1)
}

export function htmlToText(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
}

export type DnswHeadline = { period: string; visitors: number | null; nights: number | null; spend: number | null; domVisitors: number | null; domSpend: number | null; domNights: number | null; intlVisitors: number | null; intlNights: number | null; intlSpend: number | null }

const MONTHS: Record<string, string> = { january: '01', february: '02', march: '03', april: '04', may: '05', june: '06', july: '07', august: '08', september: '09', october: '10', november: '11', december: '12' }

/** Parse the Destination NSW Sydney / NSW statistics page headline block. Returns null if the layout changed. */
export function parseDnswHeadline(text: string): DnswHeadline | null {
  const p = text.match(/YEAR ENDING ([A-Z]+) (\d{4})/i)
  const v = text.match(/VISITORS\s+([\d.,]+\s*million)/i)
  const n = text.match(/NIGHTS\s+([\d.,]+\s*million)/i)
  const e = text.match(/EXPENDITURE\s+(\$[\d.,]+\s*billion)/i)
  if (!p || !v || !n || !e || !MONTHS[p[1].toLowerCase()]) return null
  const g = (re: RegExp) => { const m = text.match(re); return m ? parseMagnitude(m[1]) : null }
  return {
    period: `YE-${p[2]}-${MONTHS[p[1].toLowerCase()]}`,
    visitors: parseMagnitude(v[1]), nights: parseMagnitude(n[1]), spend: parseMagnitude(e[1]),
    domVisitors: g(/welcomed ([\d.]+ million) domestic visitors/i),
    domSpend: g(/domestic visitors, who spent (\$[\d.]+ billion)/i),
    domNights: g(/(?:Domestic overnight visitors stayed a total of|domestic overnight visitors to NSW stayed) ([\d.]+ million) nights/i),
    intlVisitors: g(/welcomed ([\d.]+ million) international visitors/i),
    intlNights: g(/international visitors\. They stayed ([\d.]+ million) nights/i),
    intlSpend: g(/nights and spent (\$[\d.]+ billion)/i),
  }
}

/** Rule-based confidence for advisor insights: data recency, geographic precision and sample adequacy. */
export function confidenceFor(o: { hasData: boolean; geoPrecise: boolean; ageYears: number; small?: boolean; proxy?: boolean }): 'high' | 'medium' | 'low' | 'insufficient' {
  if (!o.hasData) return 'insufficient'
  let score = 3
  if (!o.geoPrecise) score--
  if (o.ageYears > 3) score--
  if (o.small) score--
  if (o.proxy) score--
  return score >= 3 ? 'high' : score === 2 ? 'medium' : score === 1 ? 'low' : 'insufficient'
}
