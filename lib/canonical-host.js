/**
 * One public origin for metadataBase, canonical, Open Graph, Twitter,
 * robots, sitemaps, emails and JSON-LD.
 *
 * The Vercel project also answers on https://outza-sepia.vercel.app. That name
 * is the automatically assigned production domain (VERCEL_PROJECT_PRODUCTION_URL),
 * not the public host. Do not read VERCEL_PROJECT_PRODUCTION_URL, VERCEL_URL or
 * NEXTAUTH_URL here: those point at the legacy alias or a deployment URL.
 *
 * Set NEXT_PUBLIC_SITE_URL (or SITE_URL) when a custom domain replaces the
 * default. A value that is still the legacy alias is ignored.
 *
 * Vercel should 308 https://outza-sepia.vercel.app to this origin at the domain
 * level (Project → Settings → Domains) when the dashboard allows it. Until
 * then, next.config.js sends that host here with a 308.
 */
const CANONICAL_SITE_URL = 'https://outza-outza.vercel.app'

const LEGACY_SITE_HOSTS = ['outza-sepia.vercel.app']

const legacy = new Set(LEGACY_SITE_HOSTS.map((host) => host.toLowerCase()))

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
  if (legacy.has(host)) return null
  return url.origin
}

function resolveSiteUrl(env = process.env) {
  return explicitOrigin(env.NEXT_PUBLIC_SITE_URL) || explicitOrigin(env.SITE_URL) || CANONICAL_SITE_URL
}

module.exports = { CANONICAL_SITE_URL, LEGACY_SITE_HOSTS, resolveSiteUrl }
