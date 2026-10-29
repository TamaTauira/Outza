import { CANONICAL_SITE_URL } from '@/lib/site-url'
import { BRAND_MASCOT_EMAIL } from '@/lib/brand'
import { loadSharp } from '@/lib/images/pipeline'
import { bestSourceUrl } from '@/lib/images/source-url'
import { BROWSER_UA } from '@/lib/event-store'

/**
 * Email images are JPEG (or the original PNG) served from the canonical host.
 * Outlook cannot show WebP, AVIF or SVG. Nothing is inlined as a data URI.
 */
export const EMAIL_SIZES = { hero: { w: 1200, h: 675 }, thumb: { w: 360, h: 360 } } as const
export type EmailKind = keyof typeof EMAIL_SIZES

/** Mascot PNG on the canonical host. Used when an event has no usable image. */
export const MASCOT_EMAIL_URL = `${CANONICAL_SITE_URL}${BRAND_MASCOT_EMAIL}`

export interface ImgSource { id?: string; imageUrl: string | null; imageAsset?: { id?: string; originalPath?: string | null; sourceUrl: string; isPublic?: boolean; status: string } | null }

/** Absolute https URL on the canonical host. The public route resizes to JPEG. Null when there is nothing to show. */
export function emailImageSrc(ev: ImgSource, kind: EmailKind): string | null {
  if (!ev.id) return null
  const assetOk = !!ev.imageAsset && ev.imageAsset.status !== 'FAILED'
  if (!ev.imageUrl && !assetOk) return null
  const q = new URLSearchParams({ e: ev.id, k: kind })
  return `${CANONICAL_SITE_URL}/api/nl/img?${q}`
}

export function sourceForEmail(ev: ImgSource): string | null {
  const asset = ev.imageAsset
  if (asset?.status === 'FAILED') return bestSourceUrl(ev.imageUrl)
  return bestSourceUrl(asset?.sourceUrl || ev.imageUrl)
}

/** https image URL that is safe to fetch server-side. Rejects SVG, data URIs, and private hosts. */
export function assertPublicImageUrl(raw: string | null | undefined): string | null {
  if (!raw || raw.startsWith('data:')) return null
  let u: URL
  try { u = new URL(raw) } catch { return null }
  if (u.protocol !== 'https:' || u.username || u.password) return null
  const host = u.hostname.toLowerCase().replace(/\.$/, '')
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost') || host === 'metadata.google.internal' || host === '::1') return null
  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ip) {
    const a = Number(ip[1])
    const b = Number(ip[2])
    if (a === 10 || a === 127 || a === 0 || a >= 224) return null
    if (a === 169 && b === 254) return null
    if (a === 172 && b >= 16 && b <= 31) return null
    if (a === 192 && b === 168) return null
    if (a === 100 && b >= 64 && b <= 127) return null
  }
  if (u.pathname.toLowerCase().endsWith('.svg')) return null
  return u.toString()
}

async function fetchBytes(url: string) {
  if (!assertPublicImageUrl(url)) throw new Error('blocked image url')
  const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, Accept: 'image/jpeg,image/png,image/webp,image/*' }, signal: AbortSignal.timeout(15000), redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (!assertPublicImageUrl(res.url || url)) throw new Error('redirect blocked')
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 512 || buf.length > 8 * 1024 * 1024) throw new Error('bad size')
  return buf
}

/** JPEG rendition for the public email-image route. */
export async function renderEmailImage(src: string, kind: EmailKind): Promise<{ body: Buffer; contentType: string } | null> {
  const buf = await fetchBytes(src)
  if (buf.subarray(0, 300).toString('utf8').toLowerCase().includes('<svg')) return null
  const sharp = await loadSharp()
  if (!sharp) return null
  const { w, h } = EMAIL_SIZES[kind]
  const jpg = await sharp(buf).rotate().resize(w, h, { fit: 'cover', position: 'centre' }).jpeg({ quality: 82 }).toBuffer()
  return { body: jpg, contentType: 'image/jpeg' }
}

/** @deprecated Prefer emailImageSrc. Returns the canonical route, not a data URI. */
export async function emailImage(ev: ImgSource, kind: EmailKind): Promise<string | null> {
  return emailImageSrc(ev, kind)
}
