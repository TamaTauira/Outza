/**
 * Same show/hide rule as VibePeep Intelligence curated references.
 * A citation with no source, a bad date, a future date, or a check older than
 * six months is hidden. Event summaries use this before repeating any curated note.
 * The rule matches lib/intel/curated-refs.ts on the intelligence copy branch.
 */

export type ReferenceProblem = 'stale' | 'unverified'

export const VERIFIED_WITHIN_MONTHS = 6

function cutoffUtc(asOf: Date, months: number): number {
  let year = asOf.getUTCFullYear()
  let month = asOf.getUTCMonth() - months
  while (month < 0) {
    month += 12
    year -= 1
  }
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return Date.UTC(year, month, Math.min(asOf.getUTCDate(), lastDay))
}

function parsedUtc(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [year, month, day] = iso.split('-').map(Number)
  const utc = Date.UTC(year, month - 1, day)
  const back = new Date(utc)
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return null
  return utc
}

export function referenceProblems(ref: { lastVerified?: string | null; sourceUrl?: string | null }, asOf = new Date()): ReferenceProblem[] {
  const problems: ReferenceProblem[] = []
  const source = ref.sourceUrl?.trim() ?? ''
  const verified = parsedUtc(ref.lastVerified?.trim() ?? '')
  const today = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())
  if (!source || !/^https?:\/\//i.test(source) || verified == null || verified > today) problems.push('unverified')
  if (verified != null && verified < cutoffUtc(asOf, VERIFIED_WITHIN_MONTHS)) problems.push('stale')
  return problems
}

export function isReferenceShowable(ref: { lastVerified?: string | null; sourceUrl?: string | null }, asOf = new Date()): boolean {
  return referenceProblems(ref, asOf).length === 0
}
