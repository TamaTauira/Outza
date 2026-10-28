// National ABS imports are split into chunks that each finish well inside a serverless time limit.
// A chunk is one SDMX request (memoised when several states share it) plus the rows for one state or geo level.
// Each dataset is activated only after every one of its chunks is stored, so a timeout cannot publish a partial dataset.
import { randomBytes } from 'crypto'
import { AGE_MEASURES, REGION_MEASURES } from './sources'
import { dedupeRows, latestPeriod, versionOf, type ObsRow } from './rows'
import { isAuAsgs, sha } from './util'

export const ABS_REGION_PLAN = 'abs-region-chunks-v1'
export const ABS_SEIFA_PLAN = 'abs-seifa-chunks-v1'
/** State digits 1–8. Code 9 (Other Territories) is excluded, matching isAuAsgs. */
export const ABS_STATE_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const

export type AbsChunk = {
  id: string
  dataset: string
  flow: string
  key: string
  params: string
  kind: 'asgs' | 'lga' | 'seifa'
  /** Empty slices fail the chunk so a state is never skipped. The dataset minimum is the real volume check. */
  minRows: number
  latestAge?: boolean
  stateDigit?: string
  geoTypes?: string[]
  seifaDim?: string
  seifaGeo?: string
  seifaOk?: 'sa2' | 'lga' | 'poa' | 'sal'
}

export type AbsImportCursor = {
  plan: string
  pending: string
  done: string[]
  hashes: Record<string, string>
  chunkRows: Record<string, number>
  latest: Record<string, string | null>
  finished: string[]
  datasetHashes: Record<string, string>
}

const SEIFA_OK: Record<NonNullable<AbsChunk['seifaOk']>, (code: string) => boolean> = {
  sa2: (c) => /^[1-8]\d{8}$/.test(c),
  lga: (c) => /^[1-8]\d{4}$/.test(c),
  poa: (c) => /^\d{4}$/.test(c),
  sal: (c) => /^[1-8]\d{4}$/.test(c),
}

const num = (s?: string) => { if (s == null || s === '') return null; const n = Number(s); return isFinite(n) ? n : null }

type Group = { id: string; measures: string[]; params: string; latestAge?: boolean }

const REGION_GROUPS: Group[] = [
  { id: 'core', measures: ['ERP_P_20', 'ERP_21', 'ERP_23', 'ERP_17'], params: 'startPeriod=2016&detail=dataonly' },
  { id: 'census', measures: ['EQUIV_2', 'INCOME_2', 'LF_4', 'LF_5', 'SCHOOL_3', 'SCHOOL_5', 'HHTYPE_6', 'RENT_4', 'CENSUS_13'], params: 'startPeriod=2016&detail=dataonly' },
  { id: 'biz', measures: ['CABEE_5', 'CABEE_17', 'CABEE_20'], params: 'startPeriod=2019&detail=dataonly' },
  { id: 'ageA', measures: AGE_MEASURES.slice(0, 9).map((a) => a.code), params: 'startPeriod=2022&detail=dataonly', latestAge: true },
  { id: 'ageB', measures: AGE_MEASURES.slice(9).map((a) => a.code), params: 'startPeriod=2022&detail=dataonly', latestAge: true },
]

const HIGHER = ['SA3', 'SA4', 'GCCSA', 'STE', 'AUS']
const INDEXES = 'IRSAD+IRSD+IER+IEO'

function asgsChunk(g: Group, state: string | null): AbsChunk {
  const measures = g.measures.join('+')
  if (state) {
    return {
      id: `asgs-sa2-${g.id}-${state}`, dataset: 'asgs', flow: 'ABS_REGIONAL_ASGS2021', key: `${measures}.SA2..A`, params: g.params,
      kind: 'asgs', minRows: 1, latestAge: g.latestAge, stateDigit: state, geoTypes: ['SA2'],
    }
  }
  return {
    id: `asgs-higher-${g.id}`, dataset: 'asgs', flow: 'ABS_REGIONAL_ASGS2021', key: `${measures}.SA3+SA4+GCCSA+STE+AUS..A`, params: g.params,
    kind: 'asgs', minRows: 20, latestAge: g.latestAge, geoTypes: HIGHER,
  }
}

/** Every state and territory (SA2 digits 1–8, then GCCSA/STE/AUS, then all LGAs). Not NSW-only. `asgs` can go live before LGA finishes. */
export function absRegionChunks(): AbsChunk[] {
  const chunks: AbsChunk[] = []
  for (const g of REGION_GROUPS) {
    for (const state of ABS_STATE_DIGITS) chunks.push(asgsChunk(g, state))
    chunks.push(asgsChunk(g, null))
  }
  for (const g of REGION_GROUPS) {
    if (g.latestAge) continue
    const measures = g.measures.join('+')
    chunks.push({
      id: `lga-${g.id}`, dataset: 'lga', flow: 'ABS_REGIONAL_LGA2021', key: `${measures}...A`, params: g.params,
      kind: 'lga', minRows: 20,
    })
  }
  return chunks
}

function seifaChunk(partial: Omit<AbsChunk, 'kind' | 'params'>): AbsChunk {
  return { ...partial, kind: 'seifa', params: 'detail=dataonly' }
}

/** SA2 (by state) activates before SAL. SAL is the largest pull, so it is last and split by state. */
export function absSeifaChunks(): AbsChunk[] {
  const chunks: AbsChunk[] = []
  const sa2Key = `.${INDEXES}.SCORE+RWAD+RWSD+RWAP+RWSP`
  for (const state of ABS_STATE_DIGITS) {
    chunks.push(seifaChunk({
      id: `seifa-sa2-${state}`, dataset: 'sa2', flow: 'ABS_SEIFA2021_SA2', key: sa2Key, minRows: 1, stateDigit: state,
      seifaDim: 'ASGS_2021', seifaGeo: 'SA2', seifaOk: 'sa2',
    }))
  }
  chunks.push(seifaChunk({
    id: 'seifa-lga', dataset: 'lga', flow: 'ABS_SEIFA2021_LGA', key: `.${INDEXES}.SCORE+RWAD+RWSD+RWAP+RWSP`, minRows: 100,
    seifaDim: 'LGA_2021', seifaGeo: 'LGA', seifaOk: 'lga',
  }))
  chunks.push(seifaChunk({
    id: 'seifa-poa', dataset: 'poa', flow: 'ABS_SEIFA2021_POA', key: `.${INDEXES}.SCORE+RWAD+RWSD+RWAP+RWSP`, minRows: 100,
    seifaDim: 'POA', seifaGeo: 'POA', seifaOk: 'poa',
  }))
  const salKey = `.${INDEXES}.SCORE+RWAD+RWSD`
  for (const state of ABS_STATE_DIGITS) {
    chunks.push(seifaChunk({
      id: `seifa-sal-${state}`, dataset: 'sal', flow: 'ABS_SEIFA2021_SAL', key: salKey, minRows: 1, stateDigit: state,
      seifaDim: 'SAL', seifaGeo: 'SAL', seifaOk: 'sal',
    }))
  }
  return chunks
}

export function chunksFor(source: 'abs_region' | 'abs_seifa') {
  return source === 'abs_region' ? absRegionChunks() : absSeifaChunks()
}

export function planFor(source: 'abs_region' | 'abs_seifa') {
  return source === 'abs_region' ? ABS_REGION_PLAN : ABS_SEIFA_PLAN
}

/** Dataset-level floors, matching the old whole-file guards (region ≥ 1000, each SEIFA flow ≥ 100). */
export function datasetMinimums(source: 'abs_region' | 'abs_seifa'): Record<string, number> {
  return source === 'abs_region' ? { asgs: 1000, lga: 100 } : { sa2: 100, lga: 100, poa: 100, sal: 100 }
}

export function chunksForPlan(plan: string): AbsChunk[] | null {
  if (plan === ABS_REGION_PLAN) return absRegionChunks()
  if (plan === ABS_SEIFA_PLAN) return absSeifaChunks()
  return null
}

function stringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (typeof v === 'string') out[k] = v
  return out
}

function numberMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
  return out
}

export function readCursor(value: unknown): AbsImportCursor | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const c = value as Partial<AbsImportCursor>
  if (typeof c.plan !== 'string' || typeof c.pending !== 'string' || !Array.isArray(c.done)) return null
  const latestIn = c.latest && typeof c.latest === 'object' && !Array.isArray(c.latest) ? c.latest as Record<string, unknown> : {}
  const latest: Record<string, string | null> = {}
  for (const [k, v] of Object.entries(latestIn)) latest[k] = typeof v === 'string' ? v : null
  return {
    plan: c.plan,
    pending: c.pending,
    done: c.done.filter((x): x is string => typeof x === 'string'),
    hashes: stringMap(c.hashes),
    chunkRows: numberMap(c.chunkRows),
    latest,
    finished: Array.isArray(c.finished) ? c.finished.filter((x): x is string => typeof x === 'string') : [],
    datasetHashes: stringMap(c.datasetHashes),
  }
}

export function newCursor(plan: string): AbsImportCursor {
  return { plan, pending: `p:${randomBytes(8).toString('hex')}`, done: [], hashes: {}, chunkRows: {}, latest: {}, finished: [], datasetHashes: {} }
}

/** True when a saved cursor still has chunks or dataset activation left. Unknown plans are treated as open so they reset. */
export function isOpenImport(value: unknown): boolean {
  const cursor = readCursor(value)
  if (!cursor) return false
  const chunks = chunksForPlan(cursor.plan)
  if (!chunks) return true
  const done = chunks.filter((c) => chunkSaved(cursor, c.id))
  if (done.length < chunks.length) return true
  const datasets = new Set(chunks.map((c) => c.dataset))
  return [...datasets].some((d) => !cursor.finished.includes(d))
}

export function chunkSaved(cursor: AbsImportCursor, id: string) {
  return cursor.done.includes(id) && !!cursor.hashes[id]
}

export function datasetContentHash(ids: string[], hashes: Record<string, string>) {
  return sha(ids.map((id) => `${id}:${hashes[id] ?? ''}`).join('|'))
}

export function sourceVersionHash(datasetHashes: Record<string, string>) {
  return sha(Object.keys(datasetHashes).sort().map((k) => `${k}:${datasetHashes[k]}`).join('|'))
}

export function readHashMap(value: unknown) {
  return stringMap(value)
}

/** Age bands keep a single latest year. ERP and other measures are unchanged. */
export function keepLatestAgePeriod(rows: ObsRow[]) {
  const ages = rows.filter((r) => r.measure.startsWith('ERP_P_') && r.measure !== 'ERP_P_20')
  if (!ages.length) return rows
  const latest = ages.reduce((m, r) => (r.period > m ? r.period : m), '')
  return rows.filter((r) => !(r.measure.startsWith('ERP_P_') && r.measure !== 'ERP_P_20') || r.period === latest)
}

export function mapChunkRows(chunk: AbsChunk, csv: Record<string, string>[]): ObsRow[] {
  let rows = chunk.kind === 'asgs' ? mapAsgs(csv) : chunk.kind === 'lga' ? mapLga(csv) : mapSeifa(chunk, csv)
  if (chunk.latestAge) rows = keepLatestAgePeriod(rows)
  if (chunk.geoTypes) {
    const allow = new Set(chunk.geoTypes)
    rows = rows.filter((r) => allow.has(r.geoType))
  }
  if (chunk.stateDigit) rows = rows.filter((r) => r.geoCode.startsWith(chunk.stateDigit!))
  return dedupeRows(rows)
}

function mapAsgs(csv: Record<string, string>[]): ObsRow[] {
  const rows: ObsRow[] = []
  for (const x of csv) {
    if (!REGION_MEASURES[x.MEASURE] || !isAuAsgs(x.REGIONTYPE, x.ASGS_2021)) continue
    rows.push({ measure: x.MEASURE, geoType: x.REGIONTYPE, geoCode: x.ASGS_2021, period: x.TIME_PERIOD, value: num(x.OBS_VALUE), unit: x.UNIT_MEASURE || null, unitMult: num(x.UNIT_MULT) ?? 0, obsStatus: x.OBS_STATUS || null })
  }
  return rows
}

function mapLga(csv: Record<string, string>[]): ObsRow[] {
  const rows: ObsRow[] = []
  for (const x of csv) {
    const code = x.LGA_2021 ?? ''
    if (!REGION_MEASURES[x.MEASURE] || !/^[1-8]\d{4}$/.test(code)) continue
    rows.push({ measure: x.MEASURE, geoType: 'LGA', geoCode: code, period: x.TIME_PERIOD, value: num(x.OBS_VALUE), unit: x.UNIT_MEASURE || null, unitMult: num(x.UNIT_MULT) ?? 0, obsStatus: x.OBS_STATUS || null })
  }
  return rows
}

function mapSeifa(chunk: AbsChunk, csv: Record<string, string>[]): ObsRow[] {
  const dim = chunk.seifaDim ?? ''
  const ok = chunk.seifaOk ? SEIFA_OK[chunk.seifaOk] : () => false
  const rows: ObsRow[] = []
  for (const x of csv) {
    const code = x[dim] ?? ''
    if (!ok(code)) continue
    rows.push({ measure: x.SEIFA_MEASURE, category: x.SEIFAINDEXTYPE, geoType: chunk.seifaGeo ?? '', geoCode: code, period: x.TIME_PERIOD || '2021', value: num(x.OBS_VALUE), unit: x.UNIT_MEASURE || null, obsStatus: x.OBS_STATUS || null })
  }
  return rows
}

export function cursorRowCount(cursor: AbsImportCursor) {
  return Object.values(cursor.chunkRows).reduce((n, v) => n + v, 0)
}

export function cursorLatest(cursor: AbsImportCursor) {
  return Object.values(cursor.latest).reduce<string | null>((m, v) => (!v || (m && m > v) ? m : v), null)
}

export function chunkProgressMessage(done: number, total: number, finished: string[]) {
  const live = finished.length ? `Live: ${finished.join(', ')}.` : 'No dataset activated yet.'
  return `${done} of ${total} chunks saved. ${live} The next run continues automatically. Last good data is still being served.`
}

export { versionOf, latestPeriod }
