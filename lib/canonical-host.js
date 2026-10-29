/**
 * One public origin for metadataBase, canonical, Open Graph, Twitter,
 * robots, sitemaps, emails, JSON-LD and bot contact URLs.
 *
 * Production host is https://outza-outza.vercel.app. A missing or wrong
 * NEXTAUTH_URL must not substitute an Abacus host. Hosts on abacusai.app
 * (and abacus.ai) are ignored wherever they appear.
 *
 * Resolution order:
 *   NEXT_PUBLIC_SITE_URL, SITE_URL, NEXTAUTH_URL, AUTH_URL,
 *   then VERCEL_URL on preview deployments,
 *   then https://outza-outza.vercel.app.
 *
 * VERCEL_URL on production is the deployment hostname and changes on every
 * build, so it is not the public origin. VERCEL_PROJECT_PRODUCTION_URL is
 * the legacy alias https://outza-sepia.vercel.app and is never read.
 * That alias 308s here (next.config.js, and Vercel → Settings → Domains
 * when the dashboard allows it).
 */
const CANONICAL_SITE_URL = 'https://outza-outza.vercel.app'

const LEGACY_SITE_HOSTS = ['outza-sepia.vercel.app']

const legacy = new Set(LEGACY_SITE_HOSTS.map((host) => host.toLowerCase()))

function isAbacusHost(host) {
  return host === 'abacusai.app' || host.endsWith('.abacusai.app') || host === 'abacus.ai' || host.endsWith('.abacus.ai')
}

function explicitOrigin(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed || /localhost|127\.0\.0\.1/i.test(trimmed)) return null
  let url
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (legacy.has(host) || isAbacusHost(host)) return null
  return url.origin
}

function previewOrigin(env) {
  if (env.VERCEL_ENV !== 'preview') return null
  return explicitOrigin(env.VERCEL_URL)
}

function resolveSiteUrl(env = process.env) {
  return explicitOrigin(env.NEXT_PUBLIC_SITE_URL)
    || explicitOrigin(env.SITE_URL)
    || explicitOrigin(env.NEXTAUTH_URL)
    || explicitOrigin(env.AUTH_URL)
    || previewOrigin(env)
    || CANONICAL_SITE_URL
}

module.exports = { CANONICAL_SITE_URL, LEGACY_SITE_HOSTS, resolveSiteUrl }
