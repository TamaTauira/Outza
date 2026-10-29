/**
 * Canonical public origin. See lib/canonical-host.js. Abacus hosts are
 * never returned, including when NEXTAUTH_URL is missing or wrong.
 */
import { CANONICAL_SITE_URL, resolveSiteUrl } from './canonical-host.js'

export { CANONICAL_SITE_URL }

export function siteUrl(): string {
  return resolveSiteUrl(process.env)
}
