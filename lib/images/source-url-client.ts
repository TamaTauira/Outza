/**
 * Rewrites a known event-platform image URL to the highest-resolution original the platform serves,
 * so we never import a cropped thumbnail. Unknown hosts are returned unchanged.
 */
export function bestSourceUrl(url?: string | null): string | null {
  if (!url) return null
  let u = url.trim()
  if (!/^https?:\/\//i.test(u)) return null
  try {
    const parsed = new URL(u)
    const host = parsed.hostname

    // Ticketmaster: ..._RETINA_PORTRAIT_16_9.jpg (640px) -> TABLET_LANDSCAPE_LARGE_16_9 (2048px)
    if (/(^|\.)ticketm\.net$/.test(host)) {
      u = u.replace(/_(RETINA_PORTRAIT|RETINA_LANDSCAPE|TABLET_LANDSCAPE|RECOMENDATION|EVENT_DETAIL_PAGE|CUSTOM)_16_9(\.\w+)$/i, '_TABLET_LANDSCAPE_LARGE_16_9$2')
      return u
    }

    // Eventbrite: img.evbuc.com/<encoded cdn url>?crop=... is a cropped resize; the path is the original
    if (host === 'img.evbuc.com') {
      const inner = decodeURIComponent(parsed.pathname.slice(1))
      if (/^https:\/\/cdn\.evbuc\.com\//.test(inner)) return inner
      return u
    }

    // Humanitix: bare handle 400s; the original lives at /i/<handle>@original
    if (host === 'images.humanitix.com') {
      const m = parsed.pathname.match(/^\/(?:i\/)?([^/@]+)(?:@[\w.-]+)?$/)
      if (m) return `https://images.humanitix.com/i/${m[1]}@original`
      return u
    }

    // Cloudinary: strip resize transforms between /upload/ and the version segment
    if (host === 'res.cloudinary.com') {
      return u.replace(/\/upload\/(?:[a-z]{1,2}_[^/]+\/)+(v\d+\/)/, '/upload/$1')
    }
    return u
  } catch {
    return null
  }
}

const PRESIGNED = /X-Amz-Signature|X-Amz-Algorithm|X-Amz-Credential/i

/** A smaller rendition for on-screen use. The stored URL stays the original. */
export function displaySourceUrl(url: string | null | undefined, width: number): string | null {
  const best = bestSourceUrl(url) ?? (url && /^https?:\/\//i.test(url) ? url.trim() : null)
  if (!best) return null
  try {
    const host = new URL(best).hostname
    if (host === 'images.humanitix.com') {
      const w = width <= 160 ? 200 : width <= 480 ? 500 : width <= 900 ? 800 : 1200
      return best.replace(/@[\w.-]+$/, `@seo-${w}.jpg`)
    }
    if (/(^|\.)ticketm\.net$/.test(host)) {
      const token = width <= 200 ? 'RETINA_PORTRAIT_16_9' : width <= 800 ? 'TABLET_LANDSCAPE_16_9' : 'TABLET_LANDSCAPE_LARGE_16_9'
      return best.replace(/_TABLET_LANDSCAPE_LARGE_16_9(\.\w+)$/i, `_${token}$1`)
    }
    return best
  } catch {
    return best
  }
}

/** next/image can resize these. Presigned object-store links expire, so they stay direct. */
export function canOptimizeImage(url: string | null | undefined): boolean {
  if (!url || PRESIGNED.test(url)) return false
  try {
    const host = new URL(url).hostname.toLowerCase()
    return /images\.humanitix\.com$|(^|\.)ticketm\.net$|(^|\.)evbuc\.com$|(^|\.)cloudinary\.com$|(^|\.)moshtix\.com\.au$|(^|\.)squarespace\.com$|(^|\.)wixstatic\.com$|(^|\.)framerusercontent\.com$|(^|\.)wsimg\.com$/.test(host)
  } catch {
    return false
  }
}

