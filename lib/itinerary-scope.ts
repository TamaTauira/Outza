/**
 * Itineraries stay on this device, but each account has its own list.
 * Signing out shows an empty guest list. The old shared key is not reused.
 */

export const ITINERARY_KEY_PREFIX = 'outza-itinerary-v1'
export const LEGACY_ITINERARY_KEY = 'outza-itinerary-v1'
export const GUEST_ITINERARY_KEY = 'outza-itinerary-v1:guest'

export function itineraryStorageKey(userId: string | null | undefined): string {
  if (!userId) return GUEST_ITINERARY_KEY
  return `${ITINERARY_KEY_PREFIX}:user:${userId}`
}

/** True when leaving an account: the guest list should be emptied so the previous plans disappear. */
export function shouldClearGuestItinerary(previousUserId: string | null | undefined, nextUserId: string | null | undefined): boolean {
  return !!previousUserId && !nextUserId
}
