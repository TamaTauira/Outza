/**
 * A listing photo is too small to fill a card when its source is under ~600×400.
 * Callers then show the genre holding image. Dimensions already stored by
 * prepareEventDisplay win; a URL that names its own pixel size is next; the
 * bitmap the browser decoded is only a fallback for rows that have neither.
 */

export const MIN_LISTING_PHOTO_WIDTH = 600
export const MIN_LISTING_PHOTO_HEIGHT = 400

export function storedPhotoIsLowQuality(
  width?: number | null,
  height?: number | null,
  flag?: boolean | null,
): boolean {
  if (flag === true) return true
  if (typeof width === 'number' && width > 0 && width < MIN_LISTING_PHOTO_WIDTH) return true
  if (typeof height === 'number' && height > 0 && height < MIN_LISTING_PHOTO_HEIGHT) return true
  return false
}

/** Both source edges are known, so the page does not need to measure the file. */
export function hasStoredPhotoSize(width?: number | null, height?: number | null): boolean {
  return typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0
}

/**
 * Some hosts put the pixel size in the file name (`x140x140`) or the query
 * (`width=2400&height=1350`). A full-size original with no size in the URL
 * returns false — that is "unknown", not "good".
 */
export function declaredPhotoIsLowQuality(url?: string | null): boolean {
  if (!url) return false
  const path = url.split('?')[0]
  const tail = path.match(/(?:^|[^0-9])(\d{2,4})x(\d{2,4})$/i)
  if (tail && storedPhotoIsLowQuality(Number(tail[1]), Number(tail[2]))) return true
  const seo = path.match(/@seo-(\d+)/i)
  if (seo && Number(seo[1]) > 0 && Number(seo[1]) < MIN_LISTING_PHOTO_WIDTH) return true
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
 * naturalWidth of a next/image response is the size we asked for, not the
 * source. Only trust it when the file came back smaller than that request
 * (the optimiser does not enlarge) or when the img is the original file.
 */
export function bitmapIsLowQuality(img: {
  naturalWidth: number
  naturalHeight: number
  currentSrc?: string
  src?: string
}): boolean {
  const width = img.naturalWidth
  const height = img.naturalHeight
  if (!(width > 0) || !(height > 0)) return false
  const src = img.currentSrc || img.src || ''
  if (src.includes('/_next/image')) {
    try {
      const requested = Number(new URL(src, 'https://vibepeep.local').searchParams.get('w') || 0)
      if (requested > 0 && width + 1 >= requested) return false
      if (requested > 0) return storedPhotoIsLowQuality(width, height)
    } catch {
      return storedPhotoIsLowQuality(width, height)
    }
  }
  return storedPhotoIsLowQuality(width, height)
}
