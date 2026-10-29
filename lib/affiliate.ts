/**
 * Ticket-seller affiliate links (client-safe).
 * Ticketek's affiliate program runs on impact.com. Once VibePeep is approved, paste the tracking link from the
 * impact.com dashboard into NEXT_PUBLIC_TICKETEK_AFFILIATE_LINK (e.g. https://ticketek.example/c/123/456/789)
 * and every outbound Ticketek ticket link is deep-linked through it with the `u` parameter.
 * Unset = links go straight to Ticketek, unchanged.
 */
const TICKETEK_LINK = process.env.NEXT_PUBLIC_TICKETEK_AFFILIATE_LINK ?? ''

export const isTicketekUrl = (url?: string | null) => !!url && /^https?:\/\/([a-z0-9-]+\.)*ticketek\.(com\.au|co\.nz)(\/|$)/i.test(url)

export const hasTicketAffiliate = () => !!TICKETEK_LINK

export function ticketHref(url?: string | null): string | null {
  if (!url) return null
  if (!TICKETEK_LINK || !isTicketekUrl(url)) return url
  return `${TICKETEK_LINK}${TICKETEK_LINK.includes('?') ? '&' : '?'}u=${encodeURIComponent(url)}`
}
