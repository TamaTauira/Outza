/**
 * Pure maths for promoter and venue reach.
 * No database, no person identifiers, and no invented comparisons.
 * ProductMetric (lib/product-metrics.ts) is the shared first-party stream.
 */

export const MIN_COHORT = 10
export const MIN_PEERS = 8
export const SURFACES = ['board', 'hot', 'search', 'map', 'local', 'spotlight'] as const
export type Surface = (typeof SURFACES)[number]

export const SURFACE_LABELS: Record<Surface, string> = {
  board: 'The board',
  hot: 'Hot right now',
  search: 'Search results',
  map: 'The map',
  local: 'Local',
  spotlight: 'Spotlight',
}

export const REACTION_LABELS: Record<string, string> = {
  HOT: 'Hot',
  LOVE: 'Love it',
  INTERESTED: 'Interested',
  EXCITED: 'Excited',
}

export const HISTORY_NOTE =
  'Opens, saves, reactions and Get tickets clicks include the daily totals already on file. Get tickets clicks from before the More info split still include those taps. Appearances on the board, map, search, Hot right now and Local, More info clicks, viewer areas, search terms, hours, calendar exports and tracked-link visits start from this launch and are not backfilled. Spotlight serves and clicks use the boost records already stored. All-time counters sit beside the range.'

export function metricDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function metricHour(now = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now)
    .find((part) => part.type === 'hour')?.value
  const n = Number(hour)
  return Number.isFinite(n) ? n : 0
}

export function shiftDay(day: string, delta: number): string {
  const at = Date.parse(`${day}T00:00:00.000Z`)
  if (!Number.isFinite(at)) return day
  return new Date(at + delta * 86400000).toISOString().slice(0, 10)
}

export function parseReachRange(input: { range?: string | null; from?: string | null; to?: string | null }, now = new Date()): { from: string; to: string } {
  const today = metricDay(now)
  const to = /^\d{4}-\d{2}-\d{2}$/.test(input.to ?? '') ? input.to!.slice(0, 10) : today
  const preset = input.range === '7' || input.range === '90' || input.range === 'custom' ? input.range : '28'
  let from = preset === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(input.from ?? '') ? input.from!.slice(0, 10) : shiftDay(to, preset === '7' ? -6 : preset === '90' ? -89 : -27)
  if (from > to) from = to
  if (shiftDay(from, 179) < to) from = shiftDay(to, -179)
  return { from, to }
}

/** Sydney civil midnight as a UTC instant. Used to bound createdAt queries. */
export function sydneyInstant(day: string, end = false): Date {
  const probe = new Date(`${day}T12:00:00.000Z`)
  const name = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', timeZoneName: 'shortOffset' }).formatToParts(probe)
    .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+10'
  const match = name.match(/([+-])(\d{1,2})(?::(\d{2}))?/)
  const sign = match?.[1] === '-' ? -1 : 1
  const hours = Number(match?.[2] ?? 10)
  const mins = Number(match?.[3] ?? 0)
  const offsetMs = sign * ((hours * 60) + mins) * 60000
  const civil = Date.parse(`${day}T${end ? '23:59:59.999' : '00:00:00.000'}Z`)
  return new Date(civil - offsetMs)
}

export function eachDay(from: string, to: string): string[] {
  const days: string[] = []
  let cursor = from
  for (let i = 0; i < 200 && cursor <= to; i++) {
    days.push(cursor)
    cursor = shiftDay(cursor, 1)
  }
  return days
}

export function normalizeSearchTerm(raw: string): string | null {
  const term = raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40)
  if (term.length < 2 || term.length > 40) return null
  if (term.includes('@') || /\d{6,}/.test(term)) return null
  if (!/^[\p{L}\p{N} '&+.-]+$/u.test(term)) return null
  return term
}

export function isSurface(value: string): value is Surface {
  return (SURFACES as readonly string[]).includes(value)
}

export function clickRate(part: number, whole: number): number | null {
  if (whole <= 0 || part < 0) return null
  return Math.round((part / whole) * 1000) / 10
}

export function costPerClick(spendCents: number, clicks: number): number | null {
  if (clicks <= 0 || spendCents < 0) return null
  return Math.round(spendCents / clicks)
}

export function returnEstimate(ticketClicks: number, priceDollars: number | null): number | null {
  if (priceDollars == null || !(priceDollars > 0) || priceDollars > 10000 || ticketClicks < 0) return null
  return Math.round(ticketClicks * priceDollars * 100)
}

export function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  const suffix = h < 12 ? 'am' : 'pm'
  const clock = h % 12 === 0 ? 12 : h % 12
  return `${clock}${suffix}`
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function weekdayOf(day: string): string {
  const at = Date.parse(`${day}T00:00:00.000Z`)
  if (!Number.isFinite(at)) return ''
  return WEEKDAYS[new Date(at).getUTCDay()] ?? ''
}

export function peakWeekday(rows: { day: string; count: number }[]): string | null {
  const totals = new Map<string, number>()
  let sum = 0
  for (const row of rows) {
    const name = weekdayOf(row.day)
    if (!name || row.count <= 0) continue
    totals.set(name, (totals.get(name) ?? 0) + row.count)
    sum += row.count
  }
  if (sum < MIN_COHORT) return null
  return [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null
}

export function peakHour(rows: { hour: number; count: number }[]): number | null {
  const usable = rows.filter((row) => row.hour >= 0 && row.hour <= 23 && row.count > 0)
  const sum = usable.reduce((total, row) => total + row.count, 0)
  if (sum < MIN_COHORT) return null
  return usable.slice().sort((a, b) => b.count - a.count || a.hour - b.hour)[0]?.hour ?? null
}

export function bestTimeLine(day: string | null, hour: number | null): string | null {
  const clock = hour == null ? null : formatHour(hour)
  if (day && clock) return `Best time to post or boost: ${day}s around ${clock}, when your crowd is actually looking.`
  if (day) return `Best day to post or boost: ${day}. The hour shows up once enough people have opened the listing.`
  if (clock) return `Best hour to post or boost: around ${clock}.`
  return null
}

export function suppressSmall<T extends { count: number }>(rows: T[], min = MIN_COHORT): T[] {
  return rows.filter((row) => row.count >= min)
}

export function audienceShares(counts: { label: string; count: number }[], min = MIN_COHORT): { label: string; pct: number; count: number }[] {
  const shown = suppressSmall(counts, min).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 6)
  const total = shown.reduce((sum, row) => sum + row.count, 0)
  if (!total) return []
  return shown.map((row) => ({ label: row.label, count: row.count, pct: Math.round((row.count / total) * 100) }))
}

export type FunnelStage = { label: string; value: number | null; share: number | null; step: number | null }

export function funnel(stages: { label: string; value: number | null }[]): FunnelStage[] {
  const first = stages.find((stage) => stage.value != null)?.value ?? null
  return stages.map((stage, index) => {
    const prev = index === 0 ? stage.value : stages[index - 1]?.value
    return {
      label: stage.label,
      value: stage.value,
      share: stage.value == null || first == null || first <= 0 ? null : Math.round((stage.value / first) * 1000) / 10,
      step: stage.value == null || prev == null || prev <= 0 ? null : Math.round((stage.value / prev) * 1000) / 10,
    }
  })
}

export function benchmarkSentence(input: {
  clicks: number
  peerClicks: number
  peers: number
  category: string
  place: string
  basis: 'in this range' | 'all-time'
}): string | null {
  if (input.peers < MIN_PEERS || input.peerClicks <= 0 || input.clicks < 0) return null
  const avg = input.peerClicks / input.peers
  if (avg <= 0) return null
  const ratio = input.clicks / avg
  const rounded = ratio >= 10 ? String(Math.round(ratio)) : (Math.round(ratio * 10) / 10).toString()
  const where = `${input.category} in ${input.place}`
  if (ratio >= 1.25) return `Your Get tickets clicks are ${rounded}× the average for ${where} (${input.basis}).`
  if (ratio <= 0.75) return `Your Get tickets clicks are under the average for ${where} (${input.basis}).`
  return `Your Get tickets clicks are about level with other ${where} listings (${input.basis}).`
}

export function reachTips(input: {
  showPrivate: boolean
  hasImage: boolean
  opened: number
  seen: number
  saves: number
  ticket: number
  reactions: number
  peakHour: number | null
  peakDay: string | null
  clashes: number
  shareLinks: number
  venue: boolean
}): string[] {
  const tips: string[] = []
  if (!input.hasImage) tips.push(input.venue
    ? 'One of the listings here is still flying without a photo. A real picture stops the scroll.'
    : 'This listing is showing up in a plain tee. Add a photo and give people a reason to stop.')
  if (!input.venue && input.shareLinks === 0) tips.push('Grab a tracked link and drop it in your Instagram or TikTok bio. We’ll count the visits, no extra pixels.')
  if (input.peakHour != null && input.showPrivate) tips.push(`Your crowd peeks around ${formatHour(input.peakHour)}. That’s a sharp time to post or boost.`)
  else if (input.peakDay) tips.push(`${input.peakDay} is when they turn up. Line a boost up with that, not with a quiet Tuesday shrug.`)
  if (input.showPrivate && input.opened >= 20 && input.ticket / input.opened < 0.02) {
    tips.push('People open the listing and wander off before Get tickets. Put the ticket link where a thumb expects it.')
  }
  if (input.showPrivate && input.seen >= 40 && input.opened / input.seen < 0.08) {
    tips.push('Plenty of people see the card and keep scrolling. A tighter title, or that missing photo, usually helps.')
  }
  if (input.saves >= 5 && input.showPrivate && input.saves > input.ticket) {
    tips.push('Saves are outrunning ticket taps. They’re keen. Nudge them on the day they’re most awake.')
  }
  if (input.clashes >= 3) tips.push('A few other listings want the same night in the same patch. A different start keeps you out of the pile-up.')
  if (input.reactions >= 8 && input.showPrivate && input.opened < 5) tips.push('Reactions are bubbling while the page stays quiet. A clearer time and a photo will catch the ones who only saw the card.')
  if (!tips.length) tips.push('The numbers are still warming up. Share the listing, give it a busy night, and check back when the room has had a look.')
  return tips.slice(0, 4)
}

export function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return ''
  const text = String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  return [header.map(csvEscape).join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n') + '\n'
}

export function recapFragment(input: {
  opened: number | null
  ticket: number | null
  saves: number
  reactions: number
  tip: string | null
  benchmark: string | null
  unsubUrl: string
}): { html: string; text: string } {
  const cell = (label: string, value: string) => `<td style="padding:8px 10px;border:1px solid #e7e2d6"><div style="font-size:11px;color:#5c615c">${label}</div><div style="font-size:18px;font-weight:700">${value}</div></td>`
  const n = (value: number | null) => value == null ? 'Locked' : value.toLocaleString('en-AU')
  const html = `<h2 style="font-size:15px;margin:24px 0 8px">This week on VibePeep</h2>
<table style="width:100%;border-collapse:collapse"><tr>${cell('Opens', n(input.opened))}${cell('Get tickets', n(input.ticket))}${cell('Saves', n(input.saves))}${cell('Reactions', n(input.reactions))}</tr></table>
${input.benchmark ? `<p style="font-size:13px;margin:12px 0 0">${escapeHtml(input.benchmark)}</p>` : ''}
${input.tip ? `<p style="font-size:13px;margin:8px 0 0"><strong>A nudge:</strong> ${escapeHtml(input.tip)}</p>` : ''}
<p style="font-size:12px;margin:16px 0 0"><a href="${escapeHtml(input.unsubUrl)}">Unsubscribe from these weekly recaps</a>. Your newsletter choice stays as it is.</p>`
  const text = [
    'This week on VibePeep',
    `Opens: ${n(input.opened)}`,
    `Get tickets: ${n(input.ticket)}`,
    `Saves: ${n(input.saves)}`,
    `Reactions: ${n(input.reactions)}`,
    input.benchmark ?? '',
    input.tip ? `A nudge: ${input.tip}` : '',
    `Unsubscribe from these weekly recaps: ${input.unsubUrl}`,
  ].filter(Boolean).join('\n')
  return { html, text }
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch))
}

export type MetricHit = {
  name: string
  subjectId?: string
  subjectKind?: string
  dim?: string
  count?: number
  at?: Date
}

export function collapseHits(hits: MetricHit[], now = new Date()): { day: string; name: string; subjectId: string; subjectKind: string; dim: string; count: number }[] {
  const map = new Map<string, { day: string; name: string; subjectId: string; subjectKind: string; dim: string; count: number }>()
  for (const hit of hits) {
    const name = hit.name.trim().slice(0, 40)
    if (!name) continue
    const count = Math.max(1, Math.min(hit.count ?? 1, 100))
    const row = {
      day: metricDay(hit.at ?? now),
      name,
      subjectId: (hit.subjectId ?? '').slice(0, 80),
      subjectKind: (hit.subjectKind ?? 'event').slice(0, 20),
      dim: (hit.dim ?? '').slice(0, 80),
      count,
    }
    const key = `${row.day}|${row.name}|${row.subjectId}|${row.subjectKind}|${row.dim}`
    const prev = map.get(key)
    if (prev) prev.count += row.count
    else map.set(key, row)
  }
  return [...map.values()]
}

export function impressionSydneyDay(bucket: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(bucket)) return null
  const at = new Date(`${bucket}:00:00.000Z`)
  if (Number.isNaN(at.getTime())) return null
  return metricDay(at)
}
