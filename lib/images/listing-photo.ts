/**
 * Holding art is only for a genuinely tiny source. A 140×140 thumbnail looks
 * bad on a card. A 472×315 tile and a normal photo do not.
 * The long edge has to be under 300px. A stored lowQuality flag from the old
 * 600×400 rule is ignored; callers recompute from the pixel size.
 */

export const TINY_PHOTO_EDGE = 300

export function storedPhotoIsLowQuality(width?: number | null, height?: number | null): boolean {
  const w = typeof width === 'number' && width > 0 ? width : 0
  const h = typeof height === 'number' && height > 0 ? height : 0
  if (!w && !h) return false
  return Math.max(w, h) < TINY_PHOTO_EDGE
}

/** Both source edges are known, so the page does not need to measure the file. */
export function hasStoredPhotoSize(width?: number | null, height?: number | null): boolean {
  return typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0
}

/**
 * Some hosts put the pixel size in the file name (`x140x140`) or the query
 * (`width=200&height=200`). A full-size original with no size in the URL
 * returns false — that is "unknown", not "poor".
 */
export function declaredPhotoIsLowQuality(url?: string | null): boolean {
  if (!url) return false
  const path = url.split('?')[0]
  const tail = path.match(/(?:^|[^0-9])(\d{2,4})x(\d{2,4})$/i)
  if (tail && storedPhotoIsLowQuality(Number(tail[1]), Number(tail[2]))) return true
  const seo = path.match(/@seo-(\d+)/i)
  if (seo && Number(seo[1]) > 0 && Number(seo[1]) < TINY_PHOTO_EDGE) return true
  try {
    const query = new URL(url).searchParams
    const width = Number(query.get('width') || query.get('w') || '')
    const height = Number(query.get('height') || query.get('h') || '')
    if (width > 0 && height > 0) return storedPhotoIsLowQuality(width, height)
  } catch {
    return false
  }
  return false
}

/**
 * Last resort for a row with no stored size. Only an original file whose
 * natural width is under 300px counts. A next/image response is a resize of
 * whatever we asked for, so it must never replace a normal photo.
 */
export function bitmapIsLowQuality(img: {
  naturalWidth: number
  naturalHeight: number
  currentSrc?: string
  src?: string
}): boolean {
  const width = img.naturalWidth
  if (!(width > 0)) return false
  const src = `${img.currentSrc || ''} ${img.src || ''}`
  if (src.includes('/_next/image')) return false
  return width < TINY_PHOTO_EDGE
}
