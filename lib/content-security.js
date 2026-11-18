/**
 * Static CSP so cached pages (home, map, city and event pages revalidate every
 * 10 minutes) can keep one policy. A per-request nonce would make those pages
 * dynamic and skip that cache.
 *
 * Production drops script 'unsafe-eval'. Next dev still needs it for the
 * refresh runtime. 'unsafe-inline' stays on scripts because Next's App Router
 * bootstrap and JSON-LD blocks are inline and change per page, so a fixed
 * hash cannot cover them. Styles stay 'unsafe-inline' for the same reason.
 */

function contentSecurityPolicy(nodeEnv = process.env.NODE_ENV) {
  const dev = nodeEnv !== 'production'
  const scriptSrc = ["'self'", "'unsafe-inline'"]
  if (dev) scriptSrc.push("'unsafe-eval'")
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    dev ? '' : 'upgrade-insecure-requests',
  ].filter(Boolean).join('; ')
}

module.exports = { contentSecurityPolicy }
