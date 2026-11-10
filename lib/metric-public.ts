/** Client-safe date and search helpers. No database, no mail, no plans. */

export const METRIC_ZONE = 'Australia/Sydney'

export function sydneyDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: METRIC_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Stable key for a search. The words themselves are not kept. */
export function searchKey(query: string): string | null {
  const norm = query.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80)
  if (norm.length < 2) return null
  let h = 2166136261
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
