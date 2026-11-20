import { BRAND_NAME, BRAND_OG_IMAGE, BRAND_TAGLINE } from '@/lib/brand'

export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630
export const DEFAULT_OG_ALT = `${BRAND_NAME} — ${BRAND_TAGLINE}`

export type OgImage = {
  url: string
  width: number
  height: number
  alt: string
}

/**
 * Share-image URL safe to put in meta.
 * http:// on a host is rewritten to https:// on that same host.
 * Anything that is still not https falls through as null so the caller can use the branded image.
 * A site-relative path stays relative; metadataBase supplies the https origin.
 */
export function httpsShareUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? ''
  if (!value) return null
  if (value.startsWith('/') && !value.startsWith('//')) return value
  if (/^https:\/\//i.test(value)) return value
  if (/^http:\/\//i.test(value)) {
    const upgraded = `https://${value.slice('http://'.length)}`
    try {
      if (!new URL(upgraded).host) return null
    } catch {
      return null
    }
    return upgraded
  }
  return null
}

/** First picture that can be an https (or site-relative) share image. */
export function firstHttpsShareUrl(urls: (string | null | undefined)[]): string | null {
  for (const url of urls) {
    const safe = httpsShareUrl(url)
    if (safe) return safe
  }
  return null
}

/** og:image descriptor. Never returns an http:// URL. */
export function openGraphImage(raw: string | null | undefined, alt: string, fallback = BRAND_OG_IMAGE): OgImage {
  const url = httpsShareUrl(raw) ?? httpsShareUrl(fallback) ?? BRAND_OG_IMAGE
  const label = alt.trim() || BRAND_NAME
  const branded = url === BRAND_OG_IMAGE || url.endsWith(BRAND_OG_IMAGE)
  return branded
    ? { url, width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT, alt: label }
    : { url, width: 0, height: 0, alt: label }
}
