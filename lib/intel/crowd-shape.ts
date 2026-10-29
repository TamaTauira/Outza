// Pure shaping of imported visitor and footfall rows into the numbers the report is allowed to say.
import { pctChange } from './util'
import { STATE_NAME, type Market, type StateCode } from './markets'

type Point = { measure: string; period: string; value: number | null; category?: string }

export type VisitorSignal = {
  place: string
  region: string
  domesticTrips: number
  domesticNights: number | null
  domesticSpend: number | null
  domesticPeriod: string
  domesticYoyPct: number | null
  intlTrips: number | null
  intlPeriod: string | null
  intlYoyPct: number | null
  stateName: string
  statePeakPeriod: string | null
  statePeakTrips: number | null
  useStateTiming: boolean
  sameSeason: boolean
  note: string | null
}

export type WeekendDay = 'Friday' | 'Saturday' | 'Sunday'

export type WeekendSignal = {
  seriesLabel: string
  friIndex: number
  satIndex: number
  sunIndex: number
  weekdayAvg: number
  friAvg: number
  satAvg: number
  sunAvg: number
  busiest: WeekendDay
  quietest: WeekendDay
  from: string
  to: string
  caveat: string
  url: string
  licence: string
}

const DOW_NAME: Record<string, WeekendDay | 'weekday'> = { FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday' }
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU']

function latestPair(rows: Point[], measure: string) {
  const pts = rows.filter((r) => r.measure === measure && r.value != null).sort((a, b) => a.period.localeCompare(b.period))
  const last = pts.at(-1)
  const prev = pts.at(-2)
  return { last, yoy: last && prev ? pctChange(last.value, prev.value) : null }
}

function quarterIndex(period: string) {
  const m = period.match(/-Q([1-4])$/)
  return m ? Number(m[1]) : null
}

export function buildVisitor(market: Market, month: number, domestic: Point[], spend: Point[], intl: Point[], quarters: Point[]): VisitorSignal | null {
  const trips = latestPair(domestic, 'DOM_TRIPS')
  if (!trips.last?.value) return null
  const nights = domestic.find((r) => r.measure === 'DOM_NIGHTS' && r.period === trips.last!.period && r.value != null)
  const spendRow = spend.find((r) => r.measure === 'DOM_SPEND' && r.period === trips.last!.period && r.value != null)
    ?? latestPair(spend, 'DOM_SPEND').last
  const intlTrips = latestPair(intl, 'INTL_TRIPS')
  const quarterRows = quarters.filter((r) => r.measure === 'DOM_TRIPS' && r.value != null)
  const peak = quarterRows.reduce<Point | null>((best, row) => (!best || (row.value ?? 0) > (best.value ?? 0) ? row : best), null)
  const eventQ = Math.floor((month - 1) / 3) + 1
  return {
    place: market.id,
    region: trips.last.category?.trim() || market.domesticRegion,
    domesticTrips: trips.last.value,
    domesticNights: nights?.value ?? null,
    domesticSpend: spendRow?.value ?? null,
    domesticPeriod: trips.last.period,
    domesticYoyPct: trips.yoy,
    intlTrips: intlTrips.last?.value ?? null,
    intlPeriod: intlTrips.last?.period ?? null,
    intlYoyPct: intlTrips.yoy,
    stateName: STATE_NAME[market.state as StateCode],
    statePeakPeriod: peak?.period ?? null,
    statePeakTrips: peak?.value ?? null,
    useStateTiming: market.useStateTiming,
    sameSeason: peak?.period != null && quarterIndex(peak.period) === eventQ,
    note: market.note ?? null,
  }
}

/** Weighted mean hourly count by day, then Friday/Saturday/Sunday as a multiple of Mon–Thu. */
export function buildWeekend(rows: Point[], meta: { seriesLabel: string; caveat: string; url: string; licence: string }): WeekendSignal | null {
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
  const avgOf = (day: string) => {
    let sum = 0
    let hours = 0
    const periods = new Set(rows.filter((r) => r.category === day).map((r) => r.period))
    for (const period of periods) {
      const avg = rows.find((r) => r.period === period && r.category === day && r.measure === 'AVG_HOURLY')
      const h = rows.find((r) => r.period === period && r.category === day && r.measure === 'HOURS')
      if (avg?.value == null || h?.value == null || h.value <= 0) continue
      sum += avg.value * h.value
      hours += h.value
    }
    return hours > 0 ? sum / hours : null
  }
  const byDay = Object.fromEntries(days.map((d) => [d, avgOf(d)])) as Record<string, number | null>
  const weekdayVals = WEEKDAYS.map((d) => byDay[d]).filter((v): v is number => v != null)
  if (!weekdayVals.length || byDay.FRI == null || byDay.SAT == null || byDay.SUN == null) return null
  const weekdayAvg = weekdayVals.reduce((t, v) => t + v, 0) / weekdayVals.length
  if (!(weekdayAvg > 0)) return null
  const scored: { name: WeekendDay; index: number; avg: number }[] = (['FRI', 'SAT', 'SUN'] as const).map((d) => ({
    name: DOW_NAME[d] as WeekendDay, index: byDay[d]! / weekdayAvg, avg: byDay[d]!,
  }))
  const busiest = [...scored].sort((a, b) => b.index - a.index)[0]
  const quietest = [...scored].sort((a, b) => a.index - b.index)[0]
  const periods = [...new Set(rows.map((r) => r.period).filter((p) => /^\d{4}-\d{2}$/.test(p)))].sort()
  return {
    seriesLabel: meta.seriesLabel,
    friIndex: scored[0].index, satIndex: scored[1].index, sunIndex: scored[2].index,
    weekdayAvg, friAvg: scored[0].avg, satAvg: scored[1].avg, sunAvg: scored[2].avg,
    busiest: busiest.name, quietest: quietest.name,
    from: periods[0] ?? '', to: periods.at(-1) ?? '',
    caveat: meta.caveat, url: meta.url, licence: meta.licence,
  }
}

const millions = (n: number) => {
  const x = n / 1e6
  return `${x >= 10 ? x.toFixed(1) : x.toFixed(2)} million`
}
const signed = (p: number) => `${p >= 0 ? 'up' : 'down'} ${Math.abs(p).toFixed(1)}%`
const quarterLabel = (period: string) => {
  const m = period.match(/^(\d{4})-Q([1-4])$/)
  return m ? `${['March', 'June', 'September', 'December'][Number(m[2]) - 1]} quarter ${m[1]}` : period
}
const yeLabel = (period: string) => {
  const m = period.match(/^YE-(\d{4})-(\d{2})$/)
  if (!m) return period
  const mon = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(m[2]) - 1]
  return `the year ending ${mon} ${m[1]}`
}

export function visitorCopy(v: VisitorSignal, dowName: string, venue: string): { title: string; detail: string } {
  const yoy = v.domesticYoyPct != null ? `, ${signed(v.domesticYoyPct)} on the year before` : ''
  const regionBit = v.place === v.region ? v.region : `${v.place} (${v.region})`
  let detail = `${regionBit} had ${millions(v.domesticTrips)} domestic overnight trips in ${yeLabel(v.domesticPeriod)}${yoy}.`
  if (v.domesticNights != null) detail += ` They stayed ${millions(v.domesticNights)} nights.`
  if (v.intlTrips != null && v.intlPeriod) {
    const iy = v.intlYoyPct != null ? `, ${signed(v.intlYoyPct)} on the year before` : ''
    detail += ` International trips were ${millions(v.intlTrips)} in ${yeLabel(v.intlPeriod)}${iy}.`
  }
  if (v.statePeakPeriod && v.statePeakTrips != null) {
    const peak = `${quarterLabel(v.statePeakPeriod)} was the busiest recent quarter for ${v.stateName} overnight trips (${millions(v.statePeakTrips)})`
    if (v.useStateTiming) {
      detail += v.sameSeason
        ? ` ${peak}. This ${dowName} lands in that quarter of the year. Get the listing findable before people arrive, not the week of the show. That quarter is the whole state, of which this region is the main part, not a count at ${venue}.`
        : ` ${peak}. This ${dowName} is outside that quarter. Write the ad for people who live here, not for a full arrivals hall. The quarter is the state total, not ${venue}.`
    } else {
      detail += ` ${peak}. That is the whole state, not ${v.place}, so it is not the clock for this ad.`
    }
  } else {
    detail += ' No free quarter-by-quarter split is published for this region, so this is a year total, not a seasonal peak.'
  }
  if (v.note) detail += ` ${v.note}`
  detail += ` Survey estimates, not ${venue}.`
  const title = v.useStateTiming && v.statePeakPeriod
    ? (v.sameSeason ? `Visitor season is on for ${v.stateName}` : `Outside the ${v.stateName} visitor peak`)
    : `Visitors to ${v.region}`
  return { title, detail }
}

const times = (n: number) => `${n.toFixed(2)}×`

export function weekendCopy(w: WeekendSignal, dowName: string, dow: number, venue: string): { title: string; detail: string } {
  const shape = `Friday ${times(w.friIndex)} a weekday hour, Saturday ${times(w.satIndex)}, Sunday ${times(w.sunIndex)}`
  const level = `A weekday hour on these sensors averages about ${Math.round(w.weekdayAvg).toLocaleString('en-AU')} movements`
  const span = w.from && w.to ? ` (${w.from} to ${w.to})` : ''
  let timing: string
  const weekend = dow === 0 || dow === 5 || dow === 6
  const weekendUnderWeekday = w.friIndex < 1 && w.satIndex < 1 && w.sunIndex < 1
  if (!weekend) {
    timing = `This one is a ${dowName}, off that weekend shape. ${w.busiest} is when the sensors are busiest, if the ad should meet people who are already out.`
  } else if (weekendUnderWeekday) {
    timing = `${w.busiest} is the fullest of Friday, Saturday and Sunday, and these sensors are still busier on a weekday. ${w.quietest} is the soft one. A weekday push meets a fuller street than this ${dowName}.`
  } else if (dowName === w.busiest) {
    timing = `This ${dowName} is the busy one. People are already moving, so the listing has to say why ${venue}, and the push should be up before ${dowName}, not during it.`
  } else if (dowName === w.quietest) {
    timing = `${dowName} is the soft one. The ad has to do its work on ${w.busiest}, while the street is full, not on ${dowName} morning.`
  } else {
    timing = `This ${dowName} sits between them. ${w.busiest} is the day to ride. ${w.quietest} is the quiet one.`
  }
  return {
    title: `${w.busiest} is the busy one on the sensors`,
    detail: `${w.seriesLabel}: ${shape}. ${level}${span}. ${timing} ${w.caveat}`,
  }
}
