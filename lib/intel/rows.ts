// Observation row helpers with no database access so import planning can be unit-tested.
import { sha } from './util'

export type ObsRow = {
  measure: string; geoType: string; geoCode: string; period: string; value: number | null
  unit?: string | null; unitMult?: number; adjustment?: string; category?: string; obsStatus?: string | null
}

const rowKey = (r: ObsRow) => `${r.measure}|${r.geoType}|${r.geoCode}|${r.period}|${r.adjustment ?? ''}|${r.category ?? ''}`

/** Last row wins for the unique observation key. */
export function dedupeRows(rows: ObsRow[]) {
  const map = new Map<string, ObsRow>()
  for (const r of rows) map.set(rowKey(r), r)
  return [...map.values()]
}

export function versionOf(rows: ObsRow[]) {
  const keyed = rows.map((r) => `${rowKey(r)}|${r.value}`).sort()
  return sha(keyed.join('\n'))
}

const DATED = /^(?:YE-)?\d{4}(?:-\d{2}|-Q[1-4])?$/

export function latestPeriod(rows: ObsRow[]) {
  return rows.reduce<string | null>((m, r) => {
    if (!DATED.test(r.period)) return m
    return !m || r.period > m ? r.period : m
  }, null)
}
