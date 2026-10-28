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

