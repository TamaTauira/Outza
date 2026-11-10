import { monthlyRecurringRevenue } from '@/lib/sponsorship'
import { METRIC_ZONE, sydneyDay } from '@/lib/metric-public'

export { METRIC_ZONE, searchKey, sydneyDay } from '@/lib/metric-public'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function sydneyMonth(now = new Date()): string {
  return sydneyDay(now).slice(0, 7)
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function recentMonths(now: Date, count = 12): string[] {
  const end = sydneyMonth(now)
  const out: string[] = []
  for (let i = count - 1; i >= 0; i--) out.push(addMonths(end, -i))
  return out
}

/** UTC instant of midnight on a Sydney calendar day. */
export function zonedMidnightUtc(day: string, timeZone = METRIC_ZONE): Date {
  const [y, m, d] = day.split('-').map(Number)
  const utcGuess = Date.UTC(y, m - 1, d, 0, 0, 0)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcGuess))
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'))
  return new Date(utcGuess - (asUtc - utcGuess))
}

/** First instant of the next month, which is the end of this one. */
export function monthEndsAt(month: string): Date {
  return zonedMidnightUtc(`${addMonths(month, 1)}-01`)
}

export function shortMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const name = MONTHS[m - 1] ?? month
  return `${name} ${String(y).slice(2)}`
}

export function shortDay(day: string): string {
  const [, m, d] = day.split('-').map(Number)
  return `${d} ${MONTHS[m - 1] ?? ''}`.trim()
}

/** Monday of the Sydney calendar week that contains `day` (YYYY-MM-DD). */
export function weekStartMonday(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d))
  const dow = utc.getUTCDay()
  const delta = dow === 0 ? 6 : dow - 1
  utc.setUTCDate(utc.getUTCDate() - delta)
  return utc.toISOString().slice(0, 10)
}

export function recentWeekStarts(today: string, count = 12): string[] {
  const end = weekStartMonday(today)
  const [y, m, d] = end.split('-').map(Number)
  const out: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    out.push(new Date(Date.UTC(y, m - 1, d - i * 7)).toISOString().slice(0, 10))
  }
  return out
}

export function trackingLabel(startedAt: Date | null | undefined): string | null {
  if (!startedAt) return null
  const when = startedAt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: METRIC_ZONE })
  return `Tracking started ${when}`
}

export function weeklyReturning(
  rows: { visitorId: string; week: string }[],
  weeks: string[],
): { week: string; active: number; returning: number; rate: number | null }[] {
  const byWeek = new Map<string, Set<string>>()
  for (const row of rows) {
    const set = byWeek.get(row.week) ?? new Set<string>()
    set.add(row.visitorId)
    byWeek.set(row.week, set)
  }
  return weeks.map((week, i) => {
    const active = byWeek.get(week) ?? new Set<string>()
    const prev = i > 0 ? (byWeek.get(weeks[i - 1]) ?? new Set<string>()) : new Set<string>()
    let returning = 0
    for (const id of active) if (prev.has(id)) returning += 1
    return { week, active: active.size, returning, rate: prev.size ? returning / prev.size : null }
  })
}

export function cumulativeByMonth(
  added: { month: string; n: number }[],
  months: string[],
): { month: string; total: number; added: number }[] {
  const map = new Map(added.map((row) => [row.month, row.n]))
  const all = [...new Set([...added.map((row) => row.month), ...months])].sort()
  const running = new Map<string, { total: number; added: number }>()
  let total = 0
  for (const month of all) {
    const n = map.get(month) ?? 0
    total += n
    running.set(month, { total, added: n })
  }
  return months.map((month) => ({ month, ...(running.get(month) ?? { total, added: 0 }) }))
}

/** Share of the catalogue that had no correction, quality flag, expiry hide, or duplicate mark that month. */
export function accuracyPct(problems: number, catalogue: number): number | null {
  if (!Number.isFinite(catalogue) || catalogue <= 0) return null
  if (!Number.isFinite(problems) || problems < 0) return null
  const clean = 1 - Math.min(1, problems / catalogue)
  return Math.round(clean * 1000) / 10
}

export function sharePct(part: number, whole: number): number | null {
  if (!Number.isFinite(whole) || whole <= 0) return null
  if (!Number.isFinite(part) || part < 0) return null
  return Math.round((part / whole) * 1000) / 10
}

export function emailRates(sent: number, opened: number, clickers: number): { open: number | null; click: number | null } {
  if (!Number.isFinite(sent) || sent <= 0) return { open: null, click: null }
  const open = Number.isFinite(opened) && opened >= 0 ? Math.round((opened / sent) * 1000) / 10 : null
  const click = Number.isFinite(clickers) && clickers >= 0 ? Math.round((clickers / sent) * 1000) / 10 : null
  return { open, click }
}

export function discoveryPct(searches: number, clicks: number): number | null {
  if (!Number.isFinite(searches) || searches <= 0) return null
  if (!Number.isFinite(clicks) || clicks < 0) return null
  return Math.round((Math.min(clicks, searches) / searches) * 1000) / 10
}

export function acquisitionCostCents(spendCents: number | null, newCustomers: number): number | null {
  if (spendCents == null || !Number.isFinite(spendCents) || spendCents < 0) return null
  if (!Number.isFinite(newCustomers) || newCustomers <= 0) return null
  return Math.round(spendCents / newCustomers)
}

export function revenuePerBusinessCents(revenueCents: number, payers: number): number | null {
  if (!Number.isFinite(payers) || payers <= 0) return null
  if (!Number.isFinite(revenueCents) || revenueCents < 0) return null
  return Math.round(revenueCents / payers)
}

export function payerMonths(rows: { payer: string; month: string; cents: number }[]): Map<string, { revenue: number; payers: number; fresh: number }> {
  const first = new Map<string, string>()
  for (const row of rows) {
    if (row.cents <= 0) continue
    const prev = first.get(row.payer)
    if (!prev || row.month < prev) first.set(row.payer, row.month)
  }
  const by = new Map<string, { revenue: number; payers: Set<string> }>()
  for (const row of rows) {
    if (row.cents <= 0) continue
    const slot = by.get(row.month) ?? { revenue: 0, payers: new Set<string>() }
    slot.revenue += row.cents
    slot.payers.add(row.payer)
    by.set(row.month, slot)
  }
  const out = new Map<string, { revenue: number; payers: number; fresh: number }>()
  for (const [month, slot] of by) {
    let fresh = 0
    for (const payer of slot.payers) if (first.get(payer) === month) fresh += 1
    out.set(month, { revenue: slot.revenue, payers: slot.payers.size, fresh })
  }
  return out
}

export type PlanSnap = {
  status: string
  amountCents: number
  cancelAtPeriodEnd: boolean
  createdAt: Date
  updatedAt: Date
  currentPeriodStart: Date | null
}

/**
 * What a plan looked like at `at`, so older months can use the same MRR rule as today.
 * A plan still trialing is not revenue. A plan cancelled before `at` is gone.
 * Cancel-at-period-end only counts once that flag was already saved.
 */
export function planAt(sub: PlanSnap, at: Date): { status: string; amountCents: number; cancelAtPeriodEnd: boolean } | null {
  if (sub.amountCents <= 0) return null
  if (sub.createdAt > at) return null
  if (sub.status === 'PENDING' || sub.status === 'TRIALING') return null
  if (sub.status !== 'ACTIVE' && sub.status !== 'CANCELLED' && sub.status !== 'PAST_DUE') return null
  if ((sub.status === 'CANCELLED' || sub.status === 'PAST_DUE') && sub.updatedAt <= at) return null
  if (sub.currentPeriodStart && sub.currentPeriodStart > at) return null
  return {
    status: 'ACTIVE',
    amountCents: sub.amountCents,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd && sub.updatedAt <= at,
  }
}

export function mrrSeries(subs: PlanSnap[], months: string[], now: Date): { month: string; mrrCents: number; subscribers: number }[] {
  const current = sydneyMonth(now)
  return months.map((month) => {
    if (month === current) {
      const live = monthlyRecurringRevenue(subs)
      return { month, mrrCents: live.mrrCents, subscribers: live.subscribers }
    }
    if (month > current) return { month, mrrCents: 0, subscribers: 0 }
    const at = monthEndsAt(month)
    const snap = subs.flatMap((sub) => {
      const row = planAt(sub, at)
      return row ? [row] : []
    })
    const mrr = monthlyRecurringRevenue(snap)
    return { month, mrrCents: mrr.mrrCents, subscribers: mrr.subscribers }
  })
}

export function parseSpend(body: unknown, currentMonth: string): { month: string; amountCents: number; note: string | null } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'That didn’t look like a spend figure.' }
  const month = (body as { month?: unknown }).month
  const raw = (body as { amount?: unknown }).amount
  const noteRaw = (body as { note?: unknown }).note
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { error: 'Pick a month.' }
  if (month > currentMonth) return { error: 'That month hasn’t started.' }
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.replace(/[$,\s]/g, '') : ''
  if (!text) return { error: 'Pop in what we spent. Zero is allowed.' }
  const amount = Number(text)
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return { error: 'Enter a spend from $0 to $1,000,000.' }
  const note = typeof noteRaw === 'string' ? noteRaw.trim().slice(0, 200) : ''
  return { month, amountCents: Math.round(amount * 100), note: note || null }
}

export function trendDelta(values: (number | null)[]): string | null {
  const nums = values.filter((v): v is number => v != null)
  if (nums.length < 2) return null
  const prev = nums[nums.length - 2]
  const last = nums[nums.length - 1]
  if (prev === 0) return null
  const pct = Math.round(((last - prev) / Math.abs(prev)) * 1000) / 10
  if (pct === 0) return 'Level with the reading before'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct}% on the reading before`
}
