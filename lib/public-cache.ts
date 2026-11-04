import { PUBLIC_EVENT_TAG } from '@/lib/http-cache'

/**
 * Drop the shared listings cache after ingest.
 * CDN responses still expire on their s-maxage (at most 10 minutes).
 */
export async function invalidatePublicEvents(): Promise<void> {
  const { revalidateTag } = await import('next/cache')
  // Next 16 requires a cache profile. `max` follows the route's own revalidate window.
  revalidateTag(PUBLIC_EVENT_TAG, 'max')
}
