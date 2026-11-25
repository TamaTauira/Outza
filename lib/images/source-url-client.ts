/**
 * Rewrites a known event-platform image URL to the highest-resolution original the platform serves,
 * so we never import a cropped thumbnail. Unknown hosts are returned unchanged.
 */
const KNOWN_IMAGE_HOST = /images\.humanitix\.com$|(^|\.)ticketm\.net$|(^|\.)evbuc\.com$|(^|\.)cloudinary\.com$|(^|\.)moshtix\.com\.au$|(^|\.)oztix\.com\.au$|whatson\.cityofsydney\.nsw\.gov\.au$|(^|\.)squarespace\.com$|(^|\.)squarespace-cdn\.com$|(^|\.)wixstatic\.com$|(^|\.)framerusercontent\.com$|(^|\.)wsimg\.com$/

/** Ticketmaster's optimiser fetches 502. The browser loads the file itself. */
const SKIP_OPTIMIZER = /(^|\.)ticketm\.net$/

function upgradeHttp(url: string): string {
  if (!/^http:\/\//i.test(url)) return url
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (KNOWN_IMAGE_HOST.test(host)) return url.replace(/^http:\/\//i, 'https://')
  } catch { /* keep the original */ }
  return url
}

export function bestSourceUrl(url?: string | null): string | null {
  if (!url) return null
  let u = upgradeHttp(url.trim())
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

    // Humanitix: bare handle 400s; the original lives at /i/<handle>@original.
    // seo-200 and seo-1200 are rejected. Only seo-500, seo-800 and @original load.
    if (host === 'images.humanitix.com') {
      const m = parsed.pathname.match(/^\/(?:i\/)?([^/@]+)(?:@[\w.-]+)?$/)
      if (m) return `https://images.humanitix.com/i/${m[1]}@original`
      return u
    }

    // Oztix: the file without the width query is the full picture. A sized query is a downsample.
    if (/(^|\.)oztix\.com\.au$/.test(host)) {
      parsed.search = ''
      return parsed.toString()
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

/**
 * The file the page should load. Optimised hosts stay at the largest original so
 * next/image can resize it; a pre-shrunk thumbnail cannot be sharpened later.
 * A tiny marker still asks Ticketmaster for the 640px retina file.
 */
export function displaySourceUrl(url: string | null | undefined, width: number): string | null {
  const best = bestSourceUrl(url) ?? (url && /^https?:\/\//i.test(url) ? url.trim() : null)
  if (!best) return null
  try {
    const host = new URL(best).hostname
    if (host === 'images.humanitix.com') {
      // Heroes need the original. seo-1200 and seo-200 answer 400, so the page was falling back to the holding image.
      if (width >= 480) return best.replace(/@[\w.-]+$/, '@original')
      return best.replace(/@[\w.-]+$/, '@seo-500.jpg')
    }
    if (/(^|\.)ticketm\.net$/.test(host) && width <= 120) {
      return best.replace(/_TABLET_LANDSCAPE_LARGE_16_9(\.\w+)$/i, '_RETINA_PORTRAIT_16_9$1')
    }
    return best
  } catch {
    return best
  }
}

/** next/image can resize these. Presigned links and Ticketmaster stay direct (the optimiser 502s). */
export function canOptimizeImage(url: string | null | undefined): boolean {
  if (!url || PRESIGNED.test(url)) return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    const host = parsed.hostname.toLowerCase()
    if (SKIP_OPTIMIZER.test(host)) return false
    return KNOWN_IMAGE_HOST.test(host)
  } catch {
    return false
  }
}

/** Two Ticketmaster widths so a card does not upscale a 640px file on a phone. */
export function ticketmasterSrcSet(url: string): string | null {
  if (!/_TABLET_LANDSCAPE_LARGE_16_9\.\w+$/i.test(url)) return null
  const retina = url.replace(/_TABLET_LANDSCAPE_LARGE_16_9(\.\w+)$/i, '_RETINA_PORTRAIT_16_9$1')
  if (retina === url) return null
  return `${retina} 640w, ${url} 2048w`
}

