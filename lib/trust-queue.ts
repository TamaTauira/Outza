/** What the Trust & listings queue counts, and what Approve / Dismiss does. Pure, so tests do not need a database. */

export const QUEUE_FLAG_ACTIONS = ['DUPLICATE_FLAGGED', 'EXPIRED_HIDDEN'] as const

export type QueueKind = 'report' | 'claim' | 'flag'
export type QueueAction = 'approve' | 'dismiss'

export function pendingTotal(counts: { reports: number; claims: number; flags: number }): number {
  const n = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0)
  return n(counts.reports) + n(counts.claims) + n(counts.flags)
}

/** Pulls the kept listing id out of a duplicate-flag audit line. */
export function duplicatePrimaryId(detail: string | null | undefined): string | null {
  const match = detail?.match(/Likely duplicate of ([A-Za-z0-9]+) \(/)
  return match?.[1] ?? null
}

export function queueDecision(kind: QueueKind, action: QueueAction): { status: string; effect: 'close-report' | 'approve-claim' | 'reject-claim' | 'review-flag' } {
  if (kind === 'report') return { status: action === 'approve' ? 'RESOLVED' : 'DISMISSED', effect: 'close-report' }
  if (kind === 'claim') return { status: action === 'approve' ? 'APPROVED' : 'REJECTED', effect: action === 'approve' ? 'approve-claim' : 'reject-claim' }
  return { status: action === 'approve' ? 'APPROVED' : 'DISMISSED', effect: 'review-flag' }
}

/** Approving a "cancelled" report is the one report that changes the listing itself. */
export function reportListingEffect(reason: string, action: QueueAction): 'cancel' | 'none' {
  return action === 'approve' && reason === 'CANCELLED' ? 'cancel' : 'none'
}

export function toggleSelection(selected: string[], key: string): string[] {
  return selected.includes(key) ? selected.filter((id) => id !== key) : [...selected, key]
}

/** Select all when any are missing. Clear when every visible key is already selected. */
export function toggleAll(selected: string[], keys: string[]): string[] {
  const all = keys.length > 0 && keys.every((key) => selected.includes(key))
  return all ? selected.filter((id) => !keys.includes(id)) : [...new Set([...selected, ...keys])]
}
