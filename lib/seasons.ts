/**
 * City-level seasonal guides. One stable URL per season (`/sydney/christmas`).
 * The date window is computed at render from the city's calendar, then clipped
 * so titles never advertise days that have already passed.
 * Suburb × season URLs are not generated.
 */
import type { CityDef } from '@/lib/cities'
import { assessIndexability, type IndexReason } from '@/lib/indexability'
import type { InvRow } from '@/lib/local-seo'
import { formatGuideSpan } from '@/lib/local-seo'
import { SEASON_KEYS, addDaysKey, citySlug, cityToday, type GuideFact, type SeasonKey } from '@/lib/seo'

export interface SeasonDef {
  key: SeasonKey
  label: string
  h1: (city: string) => string
  blurb: (city: string) => string
}

export const SEASONS: SeasonDef[] = [
  {
    key: 'christmas',
    label: 'Christmas',
    h1: (city) => `Christmas events in ${city}`,
    blurb: (city) => `Markets, carols, lights and the rest of the Christmas diary in ${city}. The list is whatever VibePeep already has inside this year’s window.`,
  },
  {
    key: 'new-years-eve',
    label: 'New Year’s Eve',
    h1: (city) => `New Year’s Eve in ${city}`,
    blurb: (city) => `NYE and New Year’s Day listings in ${city}. Fireworks are included only when an organiser has published them.`,
  },
  {
    key: 'easter',
    label: 'Easter',
    h1: (city) => `Easter events in ${city}`,
    blurb: (city) => `Good Friday through Easter Monday in ${city}: markets, shows and long-weekend plans already on VibePeep.`,
  },
  {
    key: 'summer',
    label: 'Summer',
    h1: (city) => `Summer events in ${city}`,
    blurb: (city) => `December through February in ${city}. Outdoor gigs, markets and festivals whose start date sits in that summer.`,
  },
  {
    key: 'school-holidays',
    label: 'School holidays',
    h1: (city) => `School holiday activities in ${city}`,
    blurb: (city) => `The summer school break in ${city}, mid-December to the end of January. That stretch is the break every Australian state shares.`,
  },
]

export const seasonDef = (key: string): SeasonDef | undefined => SEASONS.find((s) => s.key === key)

export const seasonPath = (city: string | CityDef, key: SeasonKey) => `/${citySlug(city)}/${key}`

export interface SeasonWindow {
  from: string
  to: string
}

const yearOf = (key: string) => Number(key.slice(0, 4))

function clip(start: string, end: string, today: string): SeasonWindow | null {
  if (end < today) return null
  return { from: start > today ? start : today, to: end }
}

function lastFebruary(year: number): string {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return `${year}-02-${leap ? '29' : '28'}`
}

/** Anonymous Gregorian computus. Returns Easter Sunday as YYYY-MM-DD. */
export function easterSunday(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function firstOpen(today: string, windows: { start: string; end: string }[]): SeasonWindow {
  for (const w of windows) {
    const open = clip(w.start, w.end, today)
    if (open) return open
  }
  const last = windows[windows.length - 1]!
  return { from: last.start, to: last.end }
}

/** Upcoming window for a season in the city's timezone. Start is never before today. */
export function seasonWindow(key: SeasonKey, city: CityDef, now = new Date()): SeasonWindow {
  const today = cityToday(city, now)
  const year = yearOf(today)
  if (key === 'christmas') {
    return firstOpen(today, [0, 1].map((n) => ({ start: `${year + n}-12-01`, end: `${year + n}-12-26` })))
  }
  if (key === 'new-years-eve') {
    return firstOpen(today, [-1, 0, 1].map((n) => ({ start: `${year + n}-12-31`, end: `${year + n + 1}-01-01` })))
  }
  if (key === 'summer') {
    return firstOpen(today, [-1, 0, 1].map((n) => ({ start: `${year + n}-12-01`, end: lastFebruary(year + n + 1) })))
  }
  if (key === 'school-holidays') {
    return firstOpen(today, [-1, 0, 1].map((n) => ({ start: `${year + n}-12-15`, end: `${year + n + 1}-01-31` })))
  }
  const easters = [year, year + 1, year + 2].map((y) => {
    const sunday = easterSunday(y)
    return { start: addDaysKey(sunday, -2), end: addDaysKey(sunday, 1) }
  })
  return firstOpen(today, easters)
}

export interface SeasonDecision {
  key: SeasonKey
  path: string
  from: string
  to: string
  total: number
  index: boolean
  reason: IndexReason
}

function inWindow(dates: string[], window: SeasonWindow): boolean {
  return dates.some((d) => d >= window.from && d <= window.to)
}

/**
 * One decision per season. Empty seasons stay in the list so callers can 404 them.
 * A season that contains almost the whole city inventory is a near-duplicate of
 * the city events guide and is not indexed.
 */
export function evaluateSeasons(city: CityDef, rows: InvRow[], now = new Date()): SeasonDecision[] {
  const inventory = rows.length
  return SEASON_KEYS.map((key) => {
    const window = seasonWindow(key, city, now)
    const total = rows.reduce((n, row) => n + (inWindow(row.dates, window) ? 1 : 0), 0)
    const parentOverlap = inventory > 0 && total > 0 ? total / inventory : null
    const gate = assessIndexability({ total, parentOverlap, mode: 'seasonal' })
    return { key, path: seasonPath(city, key), from: window.from, to: window.to, total, index: gate.index, reason: gate.reason }
  })
}

export function seasonCopy(input: { city: string; season: SeasonDef; from: string; to: string; total: number }): { h1: string; title: string; description: string } {
  const span = formatGuideSpan(input.from, input.to)
  const h1 = input.season.h1(input.city)
  const count = input.total > 0 ? `${input.total} upcoming ${input.total === 1 ? 'listing' : 'listings'}` : 'Upcoming listings'
  return {
    h1,
    title: `${h1} (${span}) | VibePeep`,
    description: `${count} in ${input.city} for ${span}. ${input.season.blurb(input.city)} Past dates drop off on their own.`,
  }
}

export function seasonFacts(input: { city: string; season: SeasonDef; from: string; to: string; total: number }): GuideFact[] {
  const span = formatGuideSpan(input.from, input.to)
  const count = input.total > 0
    ? `VibePeep currently lists ${input.total} upcoming ${input.total === 1 ? 'listing' : 'listings'} whose start date sits in this window.`
    : 'Nothing in this window is listed yet.'
  const facts: GuideFact[] = [
    {
      question: `Which dates does this ${input.season.label} page cover in ${input.city}?`,
      answer: `This page is ${span}. The dates are worked out when the page renders, in ${input.city} time, and they move forward once a day has passed. ${count}`,
    },
    {
      question: `How does a listing get onto this page?`,
      answer: `Its start date has to fall inside ${span}. Cancelled listings are left off. A title that merely mentions ${input.season.label.toLowerCase()} is not enough.`,
    },
  ]
  if (input.season.key === 'school-holidays') {
    facts.push({
      question: `Are these the official ${input.city} school holidays?`,
      answer: 'This page uses mid-December to the end of January, the summer break every Australian state shares. Other term holidays differ by state, so they do not get their own page.',
    })
  }
  return facts
}
