// Downloads one chunk. TRA files are discovered from the current results page, with a known fallback.
import { fetchRetry, parseCsv } from './util'
import type { ObsRow } from './rows'
import { readXlsxSheets } from './xlsx-read'
import { parseDotsStateQuarters, parseIvsRegions, parseNvsRegionSpend, parseNvsRegions, regionSlug } from './tra-parse'
import { monthRange, type CrowdChunk } from './crowd-plan'

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; VibePeep-Intelligence/1.0; +https://vibepeep.com.au)' }
const TRA = 'https://www.tra.gov.au'

const FALLBACK = {
  nvsRegion: `${TRA}/content/dam/austrade-assets/global/wip/tra/documents/nvs/tra-nvs-trends-onight-purpose-ye-dec-24.xlsx`,
  dots: `${TRA}/content/dam/austrade-assets/global/wip/tra/documents/dots/tra-dots-june-quarter-2026-compared-to-june-quarter-2025.xlsx`,
  ivs: `${TRA}/content/dam/austrade-assets/global/wip/tra/documents/international-visitor-survey-results-june-quarter-2026.xlsx`,
  nvsSpend: `${TRA}/content/dam/austrade-assets/global/wip/tra/documents/nvs/tra-nvs-quarterly-december-2024-2023.xlsx`,
}

const MEL = 'https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets'
const BNE = 'https://data.brisbane.qld.gov.au/api/explore/v2.1/catalog/datasets/pedestrian-movement-counts'
const SYD = 'https://services1.arcgis.com/cNVyNtjGVZybOQWZ/arcgis/rest/services/Automatic_Hourly_Pedestrian_Count/FeatureServer/0/query'

const DAY: Record<string, string> = { sunday: 'SUN', monday: 'MON', tuesday: 'TUE', wednesday: 'WED', thursday: 'THU', friday: 'FRI', saturday: 'SAT' }
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function table(text: string): Record<string, string>[] {
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const semi = (first.match(/;/g) ?? []).length
  const comma = (first.match(/,/g) ?? []).length
  const src = semi > comma ? text.replace(/;/g, ',') : text
  return parseCsv(src).map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v])))
}

async function discover(page: string, pattern: RegExp, fallback: string) {
  try {
    const { res, attempts } = await fetchRetry(page, { headers: UA }, 2, 20_000)
    const html = await res.text()
    const href = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).find((h) => pattern.test(h))
    const url = !href ? fallback : href.startsWith('http') ? href : `${TRA}${href}`
    return { url, attempts }
  } catch {
    return { url: fallback, attempts: 1 }
  }
}

async function workbook(url: string, attempts: number) {
  const { res, attempts: more } = await fetchRetry(url, { headers: UA }, 2, 40_000)
  const sheets = readXlsxSheets(Buffer.from(await res.arrayBuffer()))
  return { sheets, attempts: attempts + more }
}

function sheet(sheets: Record<string, string[][]>, name: string) {
  const rows = sheets[name]
  if (!rows?.length) throw new Error(`Workbook has no sheet ${name} (found ${Object.keys(sheets).join(', ')})`)
  return rows
}

function dowOf(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(date)) return null
  return DOW[new Date(`${date.slice(0, 10)}T00:00:00Z`).getUTCDay()] ?? null
}

function add(map: Map<string, { sum: number; n: number }>, key: string, count: number) {
  const row = map.get(key) ?? { sum: 0, n: 0 }
  row.sum += count
  row.n += 1
  map.set(key, row)
}

function countRows(period: string, cityCode: string, sensorCounts: Map<string, { sum: number; n: number }>, cityCounts: Map<string, { sum: number; n: number }>): ObsRow[] {
  const sensors: ObsRow[] = []
  for (const [key, a] of sensorCounts) {
    if (a.n <= 0) continue
    const cut = key.lastIndexOf('|')
    const code = key.slice(0, cut)
    const day = key.slice(cut + 1)
    sensors.push({ measure: 'AVG_HOURLY', geoType: 'SENSOR', geoCode: code, category: day, period, value: a.sum / a.n, unit: 'movements per hour' })
    sensors.push({ measure: 'HOURS', geoType: 'SENSOR', geoCode: code, category: day, period, value: a.n, unit: 'hours' })
  }
  const city: ObsRow[] = []
  for (const [day, a] of cityCounts) {
    if (a.n <= 0) continue
    city.push({ measure: 'AVG_HOURLY', geoType: 'CITY', geoCode: cityCode, category: day, period, value: a.sum / a.n, unit: 'movements per hour' })
    city.push({ measure: 'HOURS', geoType: 'CITY', geoCode: cityCode, category: day, period, value: a.n, unit: 'hours' })
  }
  return [...sensors, ...city]
}

async function odsRecords(base: string, params: Record<string, string>) {
  const rows: Record<string, unknown>[] = []
  let attempts = 0
  for (let offset = 0; offset < 500; offset += 100) {
    const q = new URLSearchParams({ ...params, limit: '100', offset: String(offset) })
    const { res, attempts: used } = await fetchRetry(`${base}/records?${q}`, { headers: UA }, 2, 30_000)
    attempts = Math.max(attempts, used)
    const body = await res.json() as { results?: Record<string, unknown>[] }
    const batch = body.results ?? []
    rows.push(...batch)
    if (batch.length < 100) break
  }
  return { rows, attempts }
}

function siteRows(id: string, name: string, lat: number, lng: number): ObsRow[] {
  return [
    { measure: 'LAT', geoType: 'SENSOR', geoCode: id, category: name, period: 'site', value: lat, unit: 'degrees' },
    { measure: 'LNG', geoType: 'SENSOR', geoCode: id, category: name, period: 'site', value: lng, unit: 'degrees' },
  ]
}

export async function fetchCrowdChunk(chunk: CrowdChunk): Promise<{ rows: ObsRow[]; attempts: number }> {
  if (chunk.kind === 'nvs-region') {
    const found = await discover(`${TRA}/en/tourism-statistics/national-visitor-survey-trends`, /nvs-trends-onight-purpose[^"']+\.xlsx/i, FALLBACK.nvsRegion)
    const book = await workbook(found.url, found.attempts)
    return { rows: parseNvsRegions(sheet(book.sheets, 'Total')), attempts: book.attempts }
  }
  if (chunk.kind === 'dots-state') {
    const found = await discover(`${TRA}/en/tourism-statistics/domestic-tourism-statistics-results`, /dots\/[^"']+\.xlsx/i, FALLBACK.dots)
    const book = await workbook(found.url, found.attempts)
    return { rows: parseDotsStateQuarters(sheet(book.sheets, 'Table 1b')), attempts: book.attempts }
  }
  if (chunk.kind === 'ivs-region') {
    const found = await discover(`${TRA}/en/tourism-statistics/international-tourism-results`, /international-visitor-survey-results[^"']+\.xlsx/i, FALLBACK.ivs)
    const book = await workbook(found.url, found.attempts)
    return { rows: parseIvsRegions(sheet(book.sheets, 'Table 6')), attempts: book.attempts }
  }
  if (chunk.kind === 'nvs-spend') {
    const found = await discover(`${TRA}/en/tourism-statistics/national-visitor-survey-results`, /nvs-quarterly[^"']+\.xlsx/i, FALLBACK.nvsSpend)
    const book = await workbook(found.url, found.attempts)
    return { rows: parseNvsRegionSpend(sheet(book.sheets, 'Table 10')), attempts: book.attempts }
  }
  if (chunk.kind === 'mel-sites') {
    const { rows, attempts } = await odsRecords(`${MEL}/pedestrian-counting-system-sensor-locations`, {})
    const out: ObsRow[] = []
    for (const row of rows) {
      const lat = Number(row.latitude)
      const lng = Number(row.longitude)
      const id = String(row.location_id ?? '')
      const name = String(row.sensor_description ?? row.sensor_name ?? id)
      if (!id || !isFinite(lat) || !isFinite(lng)) continue
      out.push(...siteRows(id, name, lat, lng))
    }
    return { rows: out, attempts }
  }
  if (chunk.kind === 'bne-sites') {
    const q = new URLSearchParams({ select: 'location,sensor_location,lat,lon', group_by: 'location,sensor_location,lat,lon', limit: '50' })
    const { res, attempts } = await fetchRetry(`${BNE}/records?${q}`, { headers: UA }, 2, 30_000)
    const body = await res.json() as { results?: { location?: string; sensor_location?: string; lat?: number; lon?: number }[] }
    const out: ObsRow[] = []
    for (const row of body.results ?? []) {
      const name = [row.location, row.sensor_location].filter(Boolean).join(', ')
      const lat = Number(row.lat)
      const lng = Number(row.lon)
      if (!name || !isFinite(lat) || !isFinite(lng)) continue
      out.push(...siteRows(regionSlug(name), name, lat, lng))
    }
    return { rows: out, attempts }
  }
  if (chunk.kind === 'mel-month' || chunk.kind === 'bne-month') {
    const month = chunk.month ?? ''
    const { start, end } = monthRange(month)
    const brisbane = chunk.kind === 'bne-month'
    const where = brisbane ? `date>=date'${start}' AND date<date'${end}'` : `sensing_date>=date'${start}' AND sensing_date<date'${end}'`
    const select = brisbane ? 'date,count,location,sensor_location,is_computed' : 'location_id,sensing_date,pedestriancount'
    const base = brisbane ? `${BNE}/exports/csv` : `${MEL}/pedestrian-counting-system-monthly-counts-per-hour/exports/csv`
    const q = new URLSearchParams({ where, select })
    const { res, attempts } = await fetchRetry(`${base}?${q}`, { headers: UA }, 2, 40_000)
    const records = table(await res.text())
    const sensors = new Map<string, { sum: number; n: number }>()
    const city = new Map<string, { sum: number; n: number }>()
    for (const row of records) {
      const date = row.date || row.sensing_date
      const day = date ? dowOf(date) : null
      const count = Number(row.count ?? row.pedestriancount)
      if (!day || !isFinite(count)) continue
      if (brisbane && (row.is_computed === '1' || count < 25)) continue
      const code = brisbane
        ? regionSlug([row.location, row.sensor_location].filter(Boolean).join(', '))
        : String(row.location_id ?? '')
      if (!code) continue
      add(sensors, `${code}|${day}`, count)
      add(city, day, count)
    }
    return { rows: countRows(month, brisbane ? 'Brisbane' : 'Melbourne', sensors, city), attempts }
  }
  const params = new URLSearchParams({
    where: "Date >= DATE '2024-07-01' AND Date < DATE '2025-07-01'",
    outStatistics: JSON.stringify([
      { statisticType: 'avg', onStatisticField: 'TotalCount', outStatisticFieldName: 'avg_count' },
      { statisticType: 'count', onStatisticField: 'ObjectId', outStatisticFieldName: 'n' },
    ]),
    groupByFieldsForStatistics: 'Location_Name,Day',
    f: 'json',
    orderByFields: 'Location_Name',
  })
  const { res, attempts } = await fetchRetry(`${SYD}?${params}`, { headers: UA }, 2, 40_000)
  const body = await res.json() as { features?: { attributes: { Location_Name?: string; Day?: string; avg_count?: number; n?: number } }[]; error?: { message?: string } }
  if (body.error) throw new Error(body.error.message || 'Sydney pedestrian query failed')
  const sensors = new Map<string, { sum: number; n: number }>()
  const city = new Map<string, { sum: number; n: number }>()
  for (const feature of body.features ?? []) {
    const day = DAY[(feature.attributes.Day ?? '').toLowerCase()]
    const avg = Number(feature.attributes.avg_count)
    const n = Number(feature.attributes.n)
    const name = feature.attributes.Location_Name?.trim()
    if (!day || !name || !isFinite(avg) || !isFinite(n) || n <= 0) continue
    const code = regionSlug(name)
    sensors.set(`${code}|${day}`, { sum: avg * n, n })
    const cityRow = city.get(day) ?? { sum: 0, n: 0 }
    cityRow.sum += avg * n
    cityRow.n += n
    city.set(day, cityRow)
  }
  return { rows: countRows('2025-06', 'Sydney', sensors, city), attempts }
}
