import { editorialPath, EDITORIAL_GUIDES } from '@/lib/editorial'
import { REFERRAL_SOURCES, type ReferralSource } from '@/lib/referral-labels'
import { cityFromSlug } from '@/lib/seo'

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** True for a guide URL we are willing to attach conversions to. */
export function isLandingPath(path: string): boolean {
  if (!path.startsWith('/') || path.length > 160 || path.includes('?') || path.includes('#') || path.includes('..')) return false
  if (EDITORIAL_GUIDES.some((g) => editorialPath(g.slug) === path)) return true
  const parts = path.split('/').filter(Boolean)
  if (parts.length < 2 || parts.length > 4) return false
  if (!cityFromSlug(parts[0]!)) return false
  return parts.every((part) => SLUG.test(part))
}

export function landingQuery(href: string, landingPath: string): string {
  if (!isLandingPath(landingPath)) return href
  const join = href.includes('?') ? '&' : '?'
  return `${href}${join}lp=${encodeURIComponent(landingPath)}`
}

export function landingAttrFromCookies(src: string | undefined, path: string | undefined): { source: ReferralSource; path: string } | null {
  let decoded = path ?? ''
  try { decoded = decodeURIComponent(decoded) } catch { return null }
  if (!isLandingPath(decoded)) return null
  if (!src || !(REFERRAL_SOURCES as readonly string[]).includes(src)) return null
  return { source: src as ReferralSource, path: decoded }
}
