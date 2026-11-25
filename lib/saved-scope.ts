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
const LOCAL_SAVE_ID = /^local-[A-Za-z0-9]+-\d{4}-\d{2}-\d{2}$/

export function isLocalSaveId(id: string) {
  return LOCAL_SAVE_ID.test(id)
}

/**
 * Local listings are not board events, so the account payload never includes them.
 * Keep this account's device copies when the server list is applied.
 */
export function keepDeviceLocalSaves<T extends { id: string }>(server: T[], device: T[]): T[] {
  const seen = new Set(server.map((row) => row.id))
  const extra = device.filter((row) => isLocalSaveId(row.id) && !seen.has(row.id))
  return extra.length ? [...server, ...extra] : server
}

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
