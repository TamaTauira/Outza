/** How often each cron is expected to finish. A miss of twice that raises a fault. */
export const CRON_EVERY_MS: Record<string, number> = {
  intel: 24 * 60 * 60 * 1000,
  quality: 24 * 60 * 60 * 1000,
  watchlist: 24 * 60 * 60 * 1000,
  'trial-reminders': 24 * 60 * 60 * 1000,
  digest: 24 * 60 * 60 * 1000,
  'promoter-reports': 7 * 24 * 60 * 60 * 1000,
  'venue-monthly': 31 * 24 * 60 * 60 * 1000,
  'owner-alerts': 60 * 60 * 1000,
  sponsorships: 60 * 60 * 1000,
  'price-enrich': 60 * 60 * 1000,
  'ops-digest': 7 * 24 * 60 * 60 * 1000,
  synthetic: 60 * 60 * 1000,
  'refresh-ticketmaster': 60 * 60 * 1000,
  'refresh-frontier': 60 * 60 * 1000,
  'refresh-city-of-sydney': 60 * 60 * 1000,
  'refresh-humanitix': 60 * 60 * 1000,
  'refresh-moshtix': 60 * 60 * 1000,
  'refresh-oztix': 60 * 60 * 1000,
  'refresh-ticketek': 60 * 60 * 1000,
  'refresh-eventbrite': 60 * 60 * 1000,
  'refresh-popular-regulars': 60 * 60 * 1000,
  'refresh-brisbane': 60 * 60 * 1000,
  'refresh-finalize': 60 * 60 * 1000,
}

export type Heartbeat = { name: string; at: number | null }

/** A cron with no heartbeat yet is not late. One that has run and then gone quiet is. */
export function lateHeartbeats(beats: Heartbeat[], now: number): { name: string; ageMs: number; limitMs: number }[] {
  const byName = new Map(beats.map((beat) => [beat.name, beat.at]))
  const late = []
  for (const [name, every] of Object.entries(CRON_EVERY_MS)) {
    const at = byName.get(name)
    if (at == null) continue
    const ageMs = now - at
    const limitMs = every * 2
    if (ageMs > limitMs) late.push({ name, ageMs, limitMs })
  }
  return late
}
