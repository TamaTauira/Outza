import { loadSharp } from '@/lib/images/pipeline'
import { bestSourceUrl } from '@/lib/images/source-url'
import { assetIdFor } from '@/lib/images/asset-id'
import { objectExists, publicUrl, putObject, storagePath } from '@/lib/s3'
import { BROWSER_UA } from '@/lib/event-store'

/**
 * Email-safe JPEG renditions (Outlook cannot show WebP/AVIF), cached in cloud storage.
 * Built only from the authentic source/original. Conservative: Lanczos resize up to 2x, no generative steps,
 * and posters are never cropped - mismatched aspect ratios are letterboxed over a blurred copy of the same image.
 */
export const EMAIL_SIZES = { hero: { w: 1200, h: 675 }, thumb: { w: 360, h: 360 } } as const
export type EmailKind = keyof typeof EMAIL_SIZES
const V = 1
const cache = new Map<string, string | null>()

export interface ImgSource { imageUrl: string | null; imageAsset?: { id: string; originalPath: string | null; sourceUrl: string; isPublic: boolean; status: string } | null }

async function fetchBytes(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, Accept: 'image/*' }, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 512 || buf.length > 20 * 1024 * 1024) throw new Error('bad size')
  return buf
}

export async function emailImage(ev: ImgSource, kind: EmailKind): Promise<string | null> {
  const a = ev.imageAsset
  const src = a?.sourceUrl || bestSourceUrl(ev.imageUrl)
  if (!src || a?.status === 'FAILED') return null
  const id = a?.id ?? assetIdFor(src)
  const key = storagePath(`newsletter/v${V}/${id}-${kind}.jpg`)
  if (cache.has(key)) return cache.get(key)!
  let out: string | null = null
  try {
    if (await objectExists(key)) out = publicUrl(key)
    else {
      const sharp = await loadSharp()
      if (!sharp) throw new Error('image processor unavailable')
      const origin = a?.originalPath && a.isPublic ? publicUrl(a.originalPath) : src
      const buf = await fetchBytes(origin).catch(() => (origin !== src ? fetchBytes(src) : Promise.reject(new Error('download failed'))))
      const meta = await sharp(buf).metadata()
      if (!meta.width || !meta.height) throw new Error('unreadable')
      const { w: W, h: H } = EMAIL_SIZES[kind]
      // Never enlarge beyond 2x; small originals produce a smaller (still sharp) rendition
      const scale = Math.min(1, (meta.width * 2) / W, (meta.height * 2) / H)
      const w = Math.round(W * scale)
      const h = Math.round(H * scale)
      const aspectDiff = Math.abs(meta.width / meta.height - w / h) / (w / h)
      let jpg: Buffer
      if (aspectDiff <= 0.03) {
        jpg = await sharp(buf).rotate().resize(w, h, { fit: 'cover', kernel: 'lanczos3' }).flatten({ background: '#1c1c1e' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
      } else {
        const bg = await sharp(buf).rotate().resize(w, h, { fit: 'cover' }).blur(28).modulate({ brightness: 0.7 }).flatten({ background: '#1c1c1e' }).toBuffer()
        const fg = await sharp(buf).rotate().resize(w, h, { fit: 'inside', kernel: 'lanczos3' }).toBuffer()
        jpg = await sharp(bg).composite([{ input: fg, gravity: 'center' }]).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
      }
      await putObject(key, jpg, 'image/jpeg')
      out = publicUrl(key)
    }
  } catch (e: any) {
    console.error(`[newsletter] image ${kind} for ${src}: ${e?.message}`)
    out = null
  }
  cache.set(key, out)
  return out
}

/** QA: confirms an image URL actually loads as an image. */
export async function imageLoads(url: string) {
  try {
    const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) })
    return r.ok && (r.headers.get('content-type') ?? '').startsWith('image/')
  } catch {
    return false
  }
}
