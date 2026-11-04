/** Shared cache for public listings. Long enough to skip repeat reads, short of 15 minutes. */
export const PUBLIC_S_MAXAGE_SECONDS = 600
export const PUBLIC_SWR_SECONDS = 300
/** Data cache and ISR window for the same public listings. */
export const PUBLIC_REVALIDATE_SECONDS = 600
/** Invalidated after a listings ingest so the next origin read is fresh. */
export const PUBLIC_EVENT_TAG = 'events-public'

/** CDN cache for public JSON that does not depend on the signed-in visitor. */
export function publicCacheHeaders(seconds = PUBLIC_S_MAXAGE_SECONDS, swr = PUBLIC_SWR_SECONDS): Record<string, string> {
  const shared = `public, s-maxage=${seconds}, stale-while-revalidate=${swr}`
  return {
    'Cache-Control': `public, max-age=30, s-maxage=${seconds}, stale-while-revalidate=${swr}`,
    'Vercel-CDN-Cache-Control': shared,
  }
}

export const PRIVATE_NO_STORE = { 'Cache-Control': 'private, no-store' }

/** Auth.js session cookie. Reading it off the request does not by itself personalise the body. */
export function hasSessionCookie(cookies: { name: string }[]): boolean {
  return cookies.some((cookie) => cookie.name === 'authjs.session-token' || cookie.name === '__Secure-authjs.session-token')
}
