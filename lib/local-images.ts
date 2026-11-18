import { findImageForPage } from '@/lib/images/discover'
import { bestSourceUrl } from '@/lib/images/source-url'
import { humanitixListingsFromJson } from '@/lib/humanitix-refresh'

const STOCK = /picsum\.photos|placehold\.co|via\.placeholder\.com|source\.unsplash\.com|\/placeholders\//i
const PRESIGNED = /X-Amz-Signature|X-Amz-Algorithm|X-Amz-Credential/i
const PAGE_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/** A picture we can keep. Stock and holding art are not a source image. */
export function usableSourceImage(url?: string | null): string | null {
  if (!url || !/^https?:\/\//i.test(url)) return null
  const best = bestSourceUrl(url) ?? url.trim()
  if (!best || STOCK.test(best)) return null
  return best
}

/** Presigned object-store links expire, so they are not the picture we store. */
export function imageWillExpire(url: string): boolean {
  return PRESIGNED.test(url)
}

/**
 * The picture published on a listing page.
 * Humanitix pages carry bannerImage in their data payload; other pages use the share image.
 */
export async function imageFromListingPage(pageUrl: string): Promise<string | null> {
  const url = pageUrl.trim()
  if (!/^https?:\/\//i.test(url)) return null
  if (/humanitix\.com/i.test(url)) {
    try {
      const dataUrl = `${url.replace(/\/+$/, '')}/__data.json`
      const res = await fetch(dataUrl, {
        headers: { Accept: 'application/json,text/plain;q=0.9', 'User-Agent': PAGE_UA },
        redirect: 'follow',
        signal: AbortSignal.timeout(12_000),
      })
      if (res.ok) {
        const listings = humanitixListingsFromJson(await res.text())
        const found = listings.map((row) => usableSourceImage(row.imageUrl)).find((img) => img && !imageWillExpire(img))
        if (found) return found
      }
    } catch { /* the public page is the fallback */ }
  }
  const page = usableSourceImage(await findImageForPage(url))
  if (page && !imageWillExpire(page)) return page
  return null
}

/** Organiser upload wins. Otherwise the picture from the original listing. */
export function listingPicture(imagePath: string | null | undefined, sourceImageUrl: string | null | undefined, toPublic: (path: string) => string): string | null {
  if (imagePath) return toPublic(imagePath)
  return usableSourceImage(sourceImageUrl)
}
