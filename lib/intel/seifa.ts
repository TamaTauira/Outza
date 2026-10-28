// SEIFA geography for a venue.
// Preference order: suburb (SAL), then the venue's SA2.
// SAL is used only when that suburb has deciles in the active SAL dataset.
// An empty SAL import, or a suburb the SAL file does not cover, falls through to SA2.
import { SEIFA_INDEXES } from './sources'

export const SEIFA_PREFERENCE = ['SAL', 'SA2'] as const

export type SeifaCandidate = { ds: 'sal' | 'sa2'; geo: 'SAL' | 'SA2'; code: string; name: string }
export type SeifaObs = { category: string; measure: string; value: number | null }
export type SeifaIndex = { index: string; label: string; meaning: string; area: string; nswDecile: number | null; ausDecile: number | null }

export function seifaCandidates(g: { sal?: string | null; salName?: string | null; sa2?: string | null; sa2Name?: string | null }): SeifaCandidate[] {
  const out: SeifaCandidate[] = []
  if (g.sal) out.push({ ds: 'sal', geo: 'SAL', code: g.sal, name: g.salName || 'Suburb' })
  if (g.sa2) out.push({ ds: 'sa2', geo: 'SA2', code: g.sa2, name: g.sa2Name || 'Venue area' })
  return out
}

export function seifaRowsToIndexes(rows: SeifaObs[], areaName: string): SeifaIndex[] {
  return Object.entries(SEIFA_INDEXES).map(([k, d]) => ({
    index: k, label: d.label, meaning: d.meaning, area: areaName,
    nswDecile: rows.find((x) => x.category === k && x.measure === 'RWSD')?.value ?? null,
    ausDecile: rows.find((x) => x.category === k && x.measure === 'RWAD')?.value ?? null,
  })).filter((x) => x.nswDecile != null || x.ausDecile != null)
}

/** First candidate in preference order that has at least one decile. */
export async function loadSeifaIndexes(candidates: SeifaCandidate[], read: (area: SeifaCandidate) => Promise<SeifaObs[]>) {
  for (const area of candidates) {
    const indexes = seifaRowsToIndexes(await read(area), area.name)
    if (indexes.length) return indexes
  }
  return []
}
