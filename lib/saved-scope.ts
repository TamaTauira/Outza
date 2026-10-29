/**
 * Saved favourites are per account. A signed-out browser has no saved list,
 * and a device cache from another account is never uploaded or shown.
 */

export const SAVED_KEY_PREFIX = 'sydney-events-saved-v1'
export const LEGACY_SAVED_KEY = 'sydney-events-saved-v1'
export const REMOVED_KEY_PREFIX = 'sydney-events-saved-removed-v1'
export const LEGACY_REMOVED_KEY = 'sydney-events-saved-removed-v1'
export const PENDING_KEY_PREFIX = 'sydney-events-saved-pending-v1'

/** Storage key for one account. Null when signed out — nothing is shared across accounts. */
export function savedStorageKey(userId: string | null | undefined): string | null {
  if (!userId) return null
  return `${SAVED_KEY_PREFIX}:user:${userId}`
}

export function pendingStorageKey(userId: string): string {
  return `${PENDING_KEY_PREFIX}:user:${userId}`
}

/** Badge count. Signed out is always zero, even if this browser still holds another account's cache. */
export function visibleSavedCount(signedIn: boolean, accountCount: number): number {
  if (!signedIn) return 0
  return Math.max(0, accountCount)
}

/**
 * Event ids to push up when an account is linked.
 * Only this account's pending toggles. The legacy shared list is never uploaded.
 */
export function savesToUpload(userId: string | null | undefined, pendingEventIds: string[]): string[] {
  if (!userId) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of pendingEventIds) {
    if (typeof id !== 'string' || !id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}
