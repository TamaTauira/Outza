/**
 * True when a source refresh would only restamp last-checked.
 * Those rows are updated with raw SQL so Event.updatedAt stays put and later jobs can skip them.
 */
const VERIFY_ONLY = new Set(['lastVerifiedAt'])

function sameValue(stored: unknown, next: unknown): boolean {
  if (stored instanceof Date || next instanceof Date) {
    const left = stored instanceof Date ? stored.getTime() : typeof stored === 'string' ? new Date(stored).getTime() : NaN
    const right = next instanceof Date ? next.getTime() : typeof next === 'string' ? new Date(next).getTime() : NaN
    return left === right
  }
  if (Array.isArray(stored) || Array.isArray(next)) {
    return JSON.stringify(stored ?? []) === JSON.stringify(next ?? [])
  }
  if (stored == null && next == null) return true
  return stored === next
}

export function updateIsVerificationOnly(existing: Record<string, unknown>, update: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(update)) {
    if (VERIFY_ONLY.has(key)) continue
    if (!Object.prototype.hasOwnProperty.call(existing, key)) return false
    if (!sameValue(existing[key], value)) return false
  }
  return true
}
