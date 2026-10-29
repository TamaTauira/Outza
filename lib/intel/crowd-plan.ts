// Chunk list for TRA workbooks and day-of-week pedestrian counts.
// A month of hourly counts is one chunk so a 300s function can stop and resume.
import type { RunnableChunk } from './chunk-run'

export const TRA_PLAN = 'tra-visitors-v1'
export const FOOTFALL_PLAN = 'footfall-dow-v1'

export type CrowdKind = 'nvs-region' | 'dots-state' | 'ivs-region' | 'nvs-spend' | 'mel-month' | 'mel-sites' | 'bne-month' | 'bne-sites' | 'syd-year'

export type CrowdChunk = RunnableChunk & { kind: CrowdKind; month?: string }

/** October 2025 through September 2026. Twelve complete months inside the current sensor feeds. */
export const FOOTFALL_MONTHS: string[] = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(Date.UTC(2025, 9 + i, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
})

export function monthRange(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 }
  return { start: `${ym}-01`, end: `${next.y}-${String(next.m).padStart(2, '0')}-01` }
}

export function traChunks(): CrowdChunk[] {
  return [
    { id: 'nvs-region', dataset: 'region_year', minRows: 200, kind: 'nvs-region' },
    { id: 'dots-state', dataset: 'state_quarter', minRows: 40, kind: 'dots-state' },
    { id: 'ivs-region', dataset: 'intl_region', minRows: 20, kind: 'ivs-region' },
    { id: 'nvs-spend', dataset: 'region_spend', minRows: 20, kind: 'nvs-spend' },
  ]
}

export function footfallChunks(): CrowdChunk[] {
  const months = (kind: 'mel-month' | 'bne-month', dataset: string) =>
    FOOTFALL_MONTHS.map((month) => ({ id: `${dataset}-${month}`, dataset, minRows: 14, kind, month }))
  return [
    { id: 'mel-sites', dataset: 'melbourne_sites', minRows: 20, kind: 'mel-sites' },
    { id: 'bne-sites', dataset: 'brisbane_sites', minRows: 8, kind: 'bne-sites' },
    ...months('mel-month', 'melbourne'),
    ...months('bne-month', 'brisbane'),
    { id: 'syd-year', dataset: 'sydney', minRows: 14, kind: 'syd-year' },
  ]
}

export function crowdChunks(source: 'tra' | 'footfall') {
  return source === 'tra' ? traChunks() : footfallChunks()
}

export function crowdPlan(source: 'tra' | 'footfall') {
  return source === 'tra' ? TRA_PLAN : FOOTFALL_PLAN
}

export function crowdDatasetMin(source: 'tra' | 'footfall'): Record<string, number> {
  return source === 'tra'
    ? { region_year: 200, state_quarter: 40, intl_region: 20, region_spend: 20 }
    : { melbourne_sites: 20, brisbane_sites: 8, melbourne: 100, brisbane: 100, sydney: 14 }
}
