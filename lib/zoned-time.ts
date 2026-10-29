import { toSydneyParts } from '@/lib/event-store-parts'

/** UTC instant for a wall-clock YYYY-MM-DD and HH:MM in an IANA timezone. */
export function zonedWallTime(dateKey: string, time: string, timeZone: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number)
  const match = time.match(/^(\d{1,2}):(\d{2})/)
  const hh = match ? Number(match[1]) : 12
  const mm = match ? Number(match[2]) : 0
  let utc = Date.UTC(y, m - 1, d, hh, mm, 0)
  for (let i = 0; i < 4; i++) {
    const parts = toSydneyParts(new Date(utc), timeZone)
    const asUtc = Date.UTC(
      Number(parts.date.slice(0, 4)),
      Number(parts.date.slice(5, 7)) - 1,
      Number(parts.date.slice(8, 10)),
      Number(parts.time.slice(0, 2)),
      Number(parts.time.slice(3, 5)),
    )
    const want = Date.UTC(y, m - 1, d, hh, mm)
    const diff = want - asUtc
    if (diff === 0) break
    utc += diff
  }
  return new Date(utc)
}

export function hhmm(time?: string | null): string | null {
  const match = time?.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  return `${match[1].padStart(2, '0')}:${match[2]}`
}
