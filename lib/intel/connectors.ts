// Connectors for the approved public sources. Each returns datasets of observation rows; nothing is invented.
import { completeJson, llmConfigured } from '@/lib/llm'
import { prisma } from '@/lib/prisma'
import { siteUrl } from '@/lib/site-url'
import { mapChunkRows, type AbsChunk } from './abs-plan'
import { fetchRetry, htmlToText, normStation, parseCsv, parseDnswHeadline, sha } from './util'
import type { ObsRow } from './store'

export type ConnectorResult = { datasets: { dataset: string; rows: ObsRow[] }[]; note?: string; attempts: number; extra?: () => Promise<number> }

const ABS = 'https://data.api.abs.gov.au/rest/data'
const SDMX_CSV = { Accept: 'application/vnd.sdmx.data+csv' }
const UA = () => ({ 'User-Agent': `Mozilla/5.0 (compatible; VibePeep-Intelligence/1.0; +${siteUrl()})` })

async function absCsv(flow: string, key: string, params: string, attempts = 3, timeoutMs = 90_000) {
  const { res, attempts: used } = await fetchRetry(`${ABS}/ABS,${flow}/${key}?${params}`, { headers: SDMX_CSV }, attempts, timeoutMs)
  return { rows: parseCsv(await res.text()), attempts: used }
}
const num = (s?: string) => { if (s == null || s === '') return null; const n = Number(s); return isFinite(n) ? n : null }

export { isAuAsgs } from './util'

/** One fetcher per import run. State slices of the same SDMX query share a single download. */
export function createAbsFetcher() {
  const cache = new Map<string, Promise<{ rows: Record<string, string>[]; attempts: number }>>()
  return async (chunk: AbsChunk) => {
    const cacheKey = `${chunk.flow}\n${chunk.key}\n${chunk.params}`
    let pending = cache.get(cacheKey)
    if (!pending) {
      // Two short tries, not 3×90s, so one stuck call cannot burn the whole 300s invocation.
      pending = absCsv(chunk.flow, chunk.key, chunk.params, 2, 40_000)
      cache.set(cacheKey, pending)
    }
    const { rows, attempts } = await pending
    return { rows: mapChunkRows(chunk, rows), attempts }
  }
}

export async function absHsi(): Promise<ConnectorResult> {
  const r = await absCsv('HSI_M', '7+8+9..CUR.10+20.1+2+3+4+5+6+7+8+AUS.M', 'startPeriod=2019-01')
  const rows: ObsRow[] = r.rows.map((x) => ({
    measure: x.MEASURE, category: x.CATEGORY, adjustment: x.TSEST === '20' ? 'SA' : 'ORIG', geoType: x.STATE === 'AUS' ? 'AUS' : 'STE', geoCode: x.STATE,
    period: x.TIME_PERIOD, value: num(x.OBS_VALUE), unit: x.UNIT_MEASURE || null, unitMult: num(x.UNIT_MULT) ?? 0, obsStatus: x.OBS_STATUS || null,
  }))
  if (rows.length < 100) throw new Error(`HSI returned too few rows (${rows.length})`)
  return { datasets: [{ dataset: 'monthly', rows }], attempts: r.attempts }
}

const CKAN = 'https://opendata.transport.nsw.gov.au/data/api/3/action/package_show?id='
const TFNSW_USAGE = '3977df59-a1fa-422e-91ff-cfaeac355cc9'
const TFNSW_LOCATIONS = '25f006fd-d0fb-4a8e-bfda-7ea4033c1aeb'

async function ckanCsv(pkg: string) {
  const { res } = await fetchRetry(CKAN + pkg, { headers: UA() })
  const j = await res.json()
  const resources: { url: string; format?: string; last_modified?: string; metadata_modified?: string; name?: string }[] = j?.result?.resources ?? []
  const csv = resources.find((r) => (r.format ?? '').toLowerCase() === 'csv' || /\.csv($|\?)/i.test(r.url))
  if (!csv) throw new Error(`TfNSW dataset ${pkg} has no CSV resource`)
  const { res: d, attempts } = await fetchRetry(csv.url, { headers: UA() })
  return { rows: parseCsv(await d.text()), modified: csv.last_modified ?? csv.metadata_modified ?? j?.result?.metadata_modified ?? null, attempts }
}

const inNsw = (lat: number, lng: number) => lat < -28 && lat > -37.6 && lng > 140.9 && lng < 153.7

export async function tfnsw(): Promise<ConnectorResult> {
  const usage = await ckanCsv(TFNSW_USAGE)
  const rows: ObsRow[] = []
  for (const x of usage.rows) {
    const m = (x.MonthYear ?? '').match(/^(\d{4})-(\d{2})/)
    if (!m || !x.Station) continue
    const lt50 = /less than/i.test(x.Trip ?? '')
    rows.push({ measure: /exit/i.test(x.Entry_Exit) ? 'EXITS' : 'ENTRIES', geoType: 'STATION', geoCode: normStation(x.Station), category: x.Station_Type ?? '', period: `${m[1]}-${m[2]}`, value: lt50 ? null : num((x.Trip ?? '').replace(/,/g, '')), unit: 'Opal taps', obsStatus: lt50 ? 'LT50' : null })
  }
  if (rows.length < 1000) throw new Error(`TfNSW station usage returned too few rows (${rows.length})`)
  const loc = await ckanCsv(TFNSW_LOCATIONS)
  const stops = loc.rows.map((x) => ({ tsn: x.TSN || sha(x.LOCATION_NAME), name: x.LOCATION_NAME, lat: Number(x.LATITUDE), lng: Number(x.LONGITUDE), modes: x.TRANSPORT_MODE ?? '', facilities: x.FACILITIES || null, accessibility: x.ACCESSIBILITY || null }))
    .filter((s) => s.name && isFinite(s.lat) && isFinite(s.lng) && inNsw(s.lat, s.lng))
  if (stops.length < 100) throw new Error(`TfNSW locations returned too few NSW stops (${stops.length})`)
  const extra = async () => {
    for (const s of stops) {
      const data = { ...s, normName: normStation(s.name) }
      await prisma.intelTransportStop.upsert({ where: { tsn: s.tsn }, create: data, update: data })
    }
    return stops.length
  }
  return { datasets: [{ dataset: 'station_usage', rows }], attempts: Math.max(usage.attempts, loc.attempts), extra, note: `Usage file modified ${usage.modified ?? 'unknown'}; locations modified ${loc.modified ?? 'unknown'}` }
}

const DNSW = 'https://www.destinationnsw.com.au'

/** International time series for Sydney from the official Destination NSW PDF, extracted by the LLM and validated against the page headline. */
async function dnswSydneySeries(html: string, headline: { period: string; intlVisitors: number | null; intlSpend: number | null }, pdfOverride?: string): Promise<{ rows: ObsRow[]; note: string }> {
  const url = pdfOverride || (html.match(/https:\/\/cdn\.sanity\.io\/files\/[^"'\s]+Travel to Sydney Time Series[^"']*?\.pdf/i)?.[0] ?? null)
  if (!url) return { rows: [], note: 'Time-series PDF link not found on the page' }
  if (!llmConfigured()) return { rows: [], note: 'AI Gateway is not configured; time series skipped' }
  const { res } = await fetchRetry(encodeURI(decodeURI(url)), { headers: UA() })
  const b64 = Buffer.from(await res.arrayBuffer()).toString('base64')
  const prompt = 'This is the official Destination NSW "Travel to Sydney Time Series" PDF. Extract ONLY the INTERNATIONAL visitors table values for each year ending (YE) column exactly as printed. Return JSON {"rows":[{"ye":"YYYY-MM","visitors_000":number|null,"nights_000":number|null,"spend_m":number|null}]}. Use null for n/p or blank cells. Never estimate or fill gaps.'
  let parsed: { rows?: { ye?: string; visitors_000?: number | null; nights_000?: number | null; spend_m?: number | null }[] }
  try {
    parsed = await completeJson({
      temperature: 0,
      timeoutMs: 120_000,
      maxRetries: 1,
      messages: [{
        role: 'user',
        content: [
          { type: 'file', data: `data:application/pdf;base64,${b64}`, mediaType: 'application/pdf', filename: 'timeseries.pdf' },
          { type: 'text', text: prompt },
        ],
      }],
    })
  } catch {
    return { rows: [], note: 'Time series extraction returned invalid JSON' }
  }
  const list = (parsed.rows ?? []).filter((x) => /^\d{4}-\d{2}$/.test(x.ye ?? ''))
  const latest = list.find((x) => `YE-${x.ye}` === headline.period)
  // validation: latest-year visitors and spend must agree with the page headline (rounded to 0.1m / $0.1b)
  const okV = latest?.visitors_000 != null && headline.intlVisitors != null && Math.abs(latest.visitors_000 * 1000 - headline.intlVisitors) <= 50_000
  const okS = latest?.spend_m != null && headline.intlSpend != null && Math.abs(latest.spend_m * 1e6 - headline.intlSpend) <= 50e6
  if (!okV || !okS) return { rows: [], note: 'Time series failed validation against the published headline; not imported' }
  const rows: ObsRow[] = []
  for (const x of list) {
    const period = `YE-${x.ye}`
    if (x.visitors_000 != null) rows.push({ measure: 'INTL_VISITORS', geoType: 'TOURISM', geoCode: 'SYD', period, value: x.visitors_000 * 1000, unit: 'visitors' })
    if (x.nights_000 != null) rows.push({ measure: 'INTL_NIGHTS', geoType: 'TOURISM', geoCode: 'SYD', period, value: x.nights_000 * 1000, unit: 'nights' })
    if (x.spend_m != null) rows.push({ measure: 'INTL_SPEND', geoType: 'TOURISM', geoCode: 'SYD', period, value: x.spend_m * 1e6, unit: 'AUD' })
  }
  return { rows, note: `Time series: ${list.length} years extracted and validated` }
}

export async function dnsw(config?: { pdfUrl?: string } | null): Promise<ConnectorResult> {
  const rows: ObsRow[] = []
  const notes: string[] = []
  let attempts = 0
  let sydHtml = ''
  let sydHead: ReturnType<typeof parseDnswHeadline> = null
  for (const [code, path] of [['SYD', '/insights/sydney-statistics'], ['NSW', '/insights/nsw-statistics']] as const) {
    const { res, attempts: a } = await fetchRetry(DNSW + path, { headers: UA() })
    attempts = Math.max(attempts, a)
    const html = await res.text()
    const h = parseDnswHeadline(htmlToText(html))
    if (!h) throw new Error(`Destination NSW ${code} page layout changed; headline not found`)
    if (code === 'SYD') { sydHtml = html; sydHead = h }
    const add = (measure: string, value: number | null, unit: string) => { if (value != null) rows.push({ measure, geoType: 'TOURISM', geoCode: code, period: h.period, value, unit }) }
    add('VISITORS', h.visitors, 'visitors'); add('NIGHTS', h.nights, 'nights'); add('SPEND', h.spend, 'AUD')
    add('DOM_VISITORS', h.domVisitors, 'visitors'); add('DOM_SPEND', h.domSpend, 'AUD'); add('DOM_NIGHTS', h.domNights, 'nights')
    add('INTL_VISITORS', h.intlVisitors, 'visitors'); add('INTL_NIGHTS', h.intlNights, 'nights'); add('INTL_SPEND', h.intlSpend, 'AUD')
  }
  const datasets: ConnectorResult['datasets'] = [{ dataset: 'headline', rows }]
  if (sydHead) {
    try {
      const s = await dnswSydneySeries(sydHtml, sydHead, config?.pdfUrl)
      notes.push(s.note)
      if (s.rows.length) datasets.push({ dataset: 'syd_intl_series', rows: s.rows })
    } catch (e) { notes.push(`Time series skipped: ${e instanceof Error ? e.message : e}`) }
  }
  return { datasets, attempts, note: notes.join('; ') }
}
