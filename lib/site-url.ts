/**
 * Canonical public origin. See lib/canonical-host.js for why the legacy
 * Vercel alias and deployment URLs are never used.
 */
import { CANONICAL_SITE_URL, resolveSiteUrl } from './canonical-host.js'

export { CANONICAL_SITE_URL }

export function siteUrl(): string {
  return resolveSiteUrl(process.env)
}
