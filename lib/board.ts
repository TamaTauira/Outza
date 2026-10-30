import { Music, Palette, Trophy, UtensilsCrossed, Baby, PartyPopper, Users, Briefcase, Heart, GraduationCap, Sparkles, type LucideIcon } from 'lucide-react'

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Music, 'Arts & Culture': Palette, Sports: Trophy, 'Food & Drink': UtensilsCrossed, Family: Baby,
  Nightlife: PartyPopper, Community: Users, Business: Briefcase, Wellness: Heart, Education: GraduationCap,
}
export const categoryIcon = (name: string): LucideIcon => CATEGORY_ICONS[name] ?? Sparkles

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface SydneyNow { date: string; minutes: number; hh: string; mm: string; ampm: string; clock: string }

export function sydneyNow(): SydneyNow {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date())
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  const h = parseInt(g('hour'), 10)
  return {
    date: `${g('year')}-${g('month')}-${g('day')}`,
    minutes: h * 60 + parseInt(g('minute'), 10),
    hh: String(h % 12 === 0 ? 12 : h % 12),
    mm: g('minute'),
    ampm: h < 12 ? 'AM' : 'PM',
    clock: `${g('hour')}:${g('minute')}:${g('second')}`,
  }
}

/**
 * Dates the board should load. A from/to range wins over the selected day,
 * so a November range is not still a single day, and search uses the same span.
 */
export function listSpan(day: string | null, dateFrom: string, dateTo: string): { from: string; to: string; spanning: boolean } | null {
  const fromRaw = dateFrom || day || dateTo
  const toRaw = dateTo || day || dateFrom
  if (!fromRaw || !toRaw) return null
  const from = fromRaw <= toRaw ? fromRaw : toRaw
  const to = fromRaw <= toRaw ? toRaw : fromRaw
  return { from, to, spanning: from !== to }
}

export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export const utcDay = (key: string) => new Date(`${key}T00:00:00Z`)

export function dayLabel(key: string, today?: string | null): string {
  const d = utcDay(key)
  const year = key.slice(0, 4)
  const showYear = !!today && !today.startsWith(year)
  const base = `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${showYear ? ` ${year}` : ''}`
  if (today && key === today) return `Today · ${base}`
  if (today && key === addDays(today, 1)) return `Tomorrow · ${base}`
  return base
}

export function toMinutes(t: string | null): number | null {
  if (!t) return null
  const [h, m] = t.split(':').map((x) => parseInt(x, 10))
  return isNaN(h) ? null : h * 60 + (m || 0)
}

export function formatTime(t: string | null): { hm: string; ampm: string } {
  const mins = toMinutes(t)
  if (mins === null) return { hm: '--:--', ampm: '' }
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return { hm: `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}`, ampm: h < 12 ? 'am' : 'pm' }
}

export { formatPrice } from '@/lib/price'

/** "5 min ago" style label for when a listing's price was last refreshed. */
export function checkedAgo(iso?: string | null, now = Date.now()): string | null {
  if (!iso) return null
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))
  if (!Number.isFinite(mins)) return null
  if (mins < 60) return `${mins} min ago`
  const h = Math.round(mins / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)} days ago`
}

export type TimeWindow = 'now' | 'hour' | 'evening' | 'all'

export const DAY_PARTS = [
  { key: 'morning', label: 'Morning', from: 0, to: 12 * 60 },
  { key: 'afternoon', label: 'Afternoon', from: 12 * 60, to: 17 * 60 },
  { key: 'evening', label: 'Evening', from: 17 * 60, to: 22 * 60 },
  { key: 'late', label: 'Late night', from: 22 * 60, to: 24 * 60 + 1 },
] as const

/** Today’s full-day board leads with the current part, then later parts, then earlier ones. */
export function orderedDayParts(nowMinutes: number | null): Array<(typeof DAY_PARTS)[number]> {
  const parts = [...DAY_PARTS]
  if (nowMinutes == null) return parts
  const idx = parts.findIndex((p) => nowMinutes >= p.from && nowMinutes < p.to)
  if (idx <= 0) return parts
  return [...parts.slice(idx), ...parts.slice(0, idx)]
}
