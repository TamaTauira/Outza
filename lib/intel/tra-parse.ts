// Turn Tourism Research Australia workbooks into observation rows. Nothing is filled in when a cell is blank.
import type { ObsRow } from './rows'

export function regionSlug(name: string) {
  return name.normalize('NFKD').replace(/['’]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const num = (s?: string) => {
  if (s == null) return null
  const t = s.replace(/,/g, '').trim()
  if (!t || /^n\/?p$/i.test(t) || t === '-' || t === '–') return null
  const n = Number(t)
  return isFinite(n) ? n : null
}

const YEAR = /year ending december\s+(\d{4})/i
const QUARTER = /\b(march|june|september|december)\s+quarter\s+(\d{4})/i
const Q: Record<string, string> = { march: 'Q1', june: 'Q2', september: 'Q3', december: 'Q4' }

const STATES: Record<string, string> = {
  'new south wales': 'NSW', victoria: 'VIC', queensland: 'QLD', 'south australia': 'SA',
  'western australia': 'WA', tasmania: 'TAS', 'northern territory': 'NT', 'australian capital territory': 'ACT',
}

function yearCols(row: string[]) {
  const cols = new Map<number, number>()
  row.forEach((c, i) => {
    const m = c.match(YEAR)
    if (m) cols.set(i, Number(m[1]))
  })
  return cols
}

const skipRegion = (label: string) => /^total\b/i.test(label) || /unknown region/i.test(label) || /^transit\b/i.test(label) || /^other$/i.test(label) || /^other regions$/i.test(label)

/** National Visitor Survey, tourism region, year ending December. Trips and nights, 2019 onward. */
export function parseNvsRegions(rows: string[][], fromYear = 2019): ObsRow[] {
  let years = new Map<number, number>()
  for (const row of rows) {
    const found = yearCols(row)
    if (found.size > years.size) years = found
  }
  if (years.size < 2) throw new Error('NVS region sheet has no year-ending columns')
  const out: ObsRow[] = []
  let measure: 'DOM_TRIPS' | 'DOM_NIGHTS' | null = null
  for (const row of rows) {
    const label = (row[0] ?? '').replace(/\s+/g, ' ').trim()
    if (/overnight trips/i.test(label)) { measure = 'DOM_TRIPS'; continue }
    if (/visitor nights/i.test(label)) { measure = 'DOM_NIGHTS'; continue }
    if (/average stay|avg\.?\s*stay|regional spend/i.test(label)) { measure = null; continue }
    if (!measure || !label || skipRegion(label) || yearCols(row).size > 3) continue
    for (const [col, year] of years) {
      if (year < fromYear) continue
      const n = num(row[col])
      if (n == null) continue
      out.push({
        measure, geoType: 'TOURISM', geoCode: regionSlug(label), category: label, period: `YE-${year}-12`,
        value: Math.round(n * 1000), unit: measure === 'DOM_TRIPS' ? 'trips' : 'nights',
      })
    }
  }
  return out
}

/** Domestic Tourism Statistics Table 1b: quarterly state trips, nights and spend. Values are '000 or $m. */
export function parseDotsStateQuarters(rows: string[][]): ObsRow[] {
  let quarters = new Map<number, string>()
  for (const row of rows) {
    const found = new Map<number, string>()
    row.forEach((c, i) => {
      const m = c.match(QUARTER)
      if (!m) return
      const q = Q[m[1].toLowerCase()]
      if (q) found.set(i, `${m[2]}-${q}`)
    })
    if (found.size > quarters.size) quarters = found
  }
  if (quarters.size < 2) throw new Error('DoTS state sheet has no quarter columns')
  const out: ObsRow[] = []
  let measure: 'DOM_TRIPS' | 'DOM_NIGHTS' | 'DOM_SPEND' | null = null
  for (const row of rows) {
    const label = (row[0] ?? '').replace(/\s+/g, ' ').trim()
    const low = label.toLowerCase()
    if (low.includes('overnight trips')) { measure = 'DOM_TRIPS'; continue }
    if (low.includes('visitor nights')) { measure = 'DOM_NIGHTS'; continue }
    if (low.includes('expenditure') || low.includes('regional spend')) { measure = 'DOM_SPEND'; continue }
    const code = STATES[low]
    if (!measure || !code) continue
    for (const [col, period] of quarters) {
      const n = num(row[col])
      if (n == null) continue
      out.push({
        measure, geoType: 'STE', geoCode: code, category: label, period,
        value: Math.round(n * (measure === 'DOM_SPEND' ? 1e6 : 1000)),
        unit: measure === 'DOM_SPEND' ? 'AUD' : measure === 'DOM_NIGHTS' ? 'nights' : 'trips',
      })
    }
  }
  return out
}

/** International Visitor Survey top regions. Two year-ending June columns, trips / nights / $m. */
export function parseIvsRegions(rows: string[][]): ObsRow[] {
  let years: { col: number; year: number }[] = []
  for (const row of rows) {
    const found: { col: number; year: number }[] = []
    row.forEach((c, i) => {
      const m = (c ?? '').match(/year ending june\s+(\d{4})/i)
      if (m) found.push({ col: i, year: Number(m[1]) })
    })
    if (found.length > years.length) years = found
  }
  years.sort((a, b) => a.col - b.col)
  if (years.length < 2) throw new Error('IVS region sheet has no year-ending June columns')
  const out: ObsRow[] = []
  const measures = ['INTL_TRIPS', 'INTL_NIGHTS', 'INTL_SPEND'] as const
  for (const row of rows) {
    const regionAt = Number.isFinite(Number(row[0])) && row[1] ? 1 : (row[0] && !Number.isFinite(Number(row[0])) ? 0 : -1)
    if (regionAt < 0) continue
    const label = (row[regionAt] ?? '').replace(/\s+/g, ' ').trim()
    if (!label || skipRegion(label) || /region/i.test(label) && label.length < 12) continue
    const nums = row.slice(regionAt + 1)
    if (nums.filter((c) => num(c) != null).length < 4) continue
    years.forEach((col, yi) => {
      measures.forEach((measure, mi) => {
        const n = num(nums[yi * 3 + mi])
        if (n == null) return
        out.push({
          measure, geoType: 'TOURISM', geoCode: regionSlug(label), category: label, period: `YE-${col.year}-06`,
          value: Math.round(n * (measure === 'INTL_SPEND' ? 1e6 : 1000)),
          unit: measure === 'INTL_SPEND' ? 'AUD' : measure === 'INTL_NIGHTS' ? 'nights' : 'trips',
        })
      })
    })
  }
  return out
}

/**
 * NVS quarterly release, top regions, regional expenditure only.
 * Column order after rank and region: trips, nights, spend, each as a pair of years.
 */
export function parseNvsRegionSpend(rows: string[][]): ObsRow[] {
  let years: number[] = []
  for (const row of rows) {
    const found: number[] = []
    for (const c of row) {
      const m = (c ?? '').match(/year ending december\s+(\d{4})/i)
      if (m && !found.includes(Number(m[1]))) found.push(Number(m[1]))
    }
    if (found.length > years.length) years = found
  }
  if (years.length < 2) throw new Error('NVS top-region sheet has no year columns')
  const out: ObsRow[] = []
  for (const row of rows) {
    if (!Number.isFinite(Number(row[0])) || !row[1]) continue
    const label = row[1].replace(/\s+/g, ' ').trim()
    if (!label || skipRegion(label)) continue
    // trips pair, nights pair, then spend pair
    years.forEach((year, yi) => {
      const n = num(row[6 + yi])
      if (n == null) return
      out.push({
        measure: 'DOM_SPEND', geoType: 'TOURISM', geoCode: regionSlug(label), category: label, period: `YE-${year}-12`,
        value: Math.round(n * 1e6), unit: 'AUD',
      })
    })
  }
  return out
}
