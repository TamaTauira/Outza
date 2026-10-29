/** CDN cache for public JSON that does not depend on the signed-in visitor. */
export function publicCacheHeaders(seconds = 60): Record<string, string> {
  const shared = `public, s-maxage=${seconds}, stale-while-revalidate=${seconds * 5}`
  return {
    'Cache-Control': `public, max-age=30, s-maxage=${seconds}, stale-while-revalidate=${seconds * 5}`,
    'Vercel-CDN-Cache-Control': shared,
  }
}

export const PRIVATE_NO_STORE = { 'Cache-Control': 'private, no-store' }

/** Auth.js session cookie. Reading it off the request does not by itself personalise the body. */
export function hasSessionCookie(cookies: { name: string }[]): boolean {
  return cookies.some((cookie) => cookie.name === 'authjs.session-token' || cookie.name === '__Secure-authjs.session-token')
}
