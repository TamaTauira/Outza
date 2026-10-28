import crypto from 'crypto'
import type sharpDefault from 'sharp'
import { prisma } from '@/lib/prisma'
import { putObject, publicUrl, storagePath } from '@/lib/s3'
import { BROWSER_UA } from '@/lib/event-store'
import { FORMATS, VARIANTS, type VariantKind, type VariantManifest } from './spec'
import { blockiness, dHash, hamming, meanColourShift, psnr, sharpness } from './quality'

type SharpFn = typeof sharpDefault
let sharpMod: SharpFn | null | undefined
/** sharp is loaded lazily so a platform without the native binary degrades to source images, never a crash. */
export async function loadSharp(): Promise<SharpFn | null> {
  if (sharpMod !== undefined) return sharpMod
  try {
    const m: any = await import('sharp')
    sharpMod = (m.default ?? m) as SharpFn
    sharpMod.concurrency(1)
  } catch (e: any) {
    console.error('[images] sharp unavailable:', e?.message)
    sharpMod = null
  }
  return sharpMod
}

const MAX_BYTES = 20 * 1024 * 1024
const STANDARD_WIDTH = 1920 // hero width; at or above: no enhancement needed
const MIN_WIDTH = 480 // below: flagged for manual review (still upscaled)
const MAX_UPSCALE = 3
const BLURRY = 40 // Laplacian variance threshold (512px greyscale)
const BLOCKY = 1.45
const COVER_TOLERANCE = 0.03 // only crop when the aspect differs by <=3% (never cuts poster text)
// Integrity thresholds: the enhanced image, compared with the original at thumbnail scale, must match it
const MIN_PSNR = 32
const MAX_HASH_DISTANCE = 6
const MAX_COLOUR_SHIFT = 3

export type Outcome = 'ok' | 'enhanced' | 'rejected' | 'review' | 'failed' | 'cached' | 'unchanged'

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
    signal: AbortSignal.timeout(30000),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const len = Number(res.headers.get('content-length') ?? 0)
  if (len > MAX_BYTES) throw new Error('image too large')
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_BYTES) throw new Error('image too large')
  if (buf.length < 512) throw new Error('empty image')
  return buf
}

/** Deterministic, non-generative upscale (Lanczos3, optional unsharp). Returns null buf only if even plain Lanczos fails the integrity check. */
async function enhance(sharp: SharpFn, img: Buffer, w: number, h: number) {
  const factor = Math.min(MAX_UPSCALE, STANDARD_WIDTH / w)
  if (factor < 1.1) return { buf: null, integrity: null }
  const tw = Math.round(w * factor), th = Math.round(h * factor)
  // Two-step Lanczos for large factors (cleaner edges on text)
  const base = factor > 2
    ? await sharp(img).resize(Math.round(w * 1.6), Math.round(h * 1.6), { kernel: 'lanczos3', fit: 'fill' }).png().toBuffer()
    : img
  const scaled = await sharp(base).resize(tw, th, { kernel: 'lanczos3', fit: 'fill' }).png({ compressionLevel: 3 }).toBuffer()
  // Fidelity is compared on 128px thumbnails: real content changes still show, while the sub-pixel resampling-grid
  // differences of any resize round trip (which fail a full-res PSNR even for pure Lanczos) do not
  const cw = 128, ch = 128
  const orig = await sharp(img).resize(cw, ch, { kernel: 'lanczos3', fit: 'fill' }).removeAlpha().toColourspace('srgb').raw().toBuffer()
  const origHash = await dHash(sharp, img)
  // Strongest sharpening that still passes the integrity check wins; plain Lanczos is the final fallback
  const attempts: Array<{ mode: string; sharpen: { sigma: number; m1: number; m2: number; x1: number; y2: number; y3: number } | null }> = [
    { mode: 'sharp', sharpen: { sigma: 0.5 + 0.25 * factor, m1: 0.6, m2: 1.6, x1: 2, y2: 8, y3: 16 } },
    { mode: 'mild', sharpen: { sigma: 0.6, m1: 0.3, m2: 0.8, x1: 2, y2: 4, y3: 8 } },
    { mode: 'lanczos', sharpen: null },
  ]
  let last: Record<string, unknown> | null = null
  for (const a of attempts) {
    const up = a.sharpen ? await sharp(scaled).sharpen(a.sharpen).png({ compressionLevel: 3 }).toBuffer() : scaled
    const back = await sharp(up).resize(cw, ch, { kernel: 'lanczos3', fit: 'fill' }).removeAlpha().toColourspace('srgb').raw().toBuffer()
    const integrity = {
      psnr: Math.round(psnr(orig, back) * 10) / 10,
      hash: hamming(origHash, await dHash(sharp, up)),
      colour: Math.round(meanColourShift(orig, back) * 100) / 100,
      factor: Math.round(factor * 100) / 100,
      mode: a.mode,
    }
    const pass = integrity.psnr >= MIN_PSNR && integrity.hash <= MAX_HASH_DISTANCE && integrity.colour <= MAX_COLOUR_SHIFT
    last = { ...integrity, pass }
    if (pass) return { buf: up, integrity: last }
  }
  return { buf: null, integrity: last }
}

/** Renders one variant: cover only when the aspect already matches, else the full image over a blurred extension of itself. */
async function renderVariant(sharp: SharpFn, master: Buffer, mw: number, mh: number, W: number, H: number) {
  const src = mw / mh, target = W / H
  let base: import('sharp').Sharp
  let fit: 'cover' | 'contain-blur'
  if (Math.abs(src / target - 1) <= COVER_TOLERANCE) {
    fit = 'cover'
    base = sharp(master).resize(W, H, { fit: 'cover', kernel: 'lanczos3' })
  } else {
    fit = 'contain-blur'
    const scale = Math.min(W / mw, H / mh, 1.05) // never stretch the artwork beyond the master
    const fw = Math.max(1, Math.round(mw * scale)), fh = Math.max(1, Math.round(mh * scale))
    const [bg, fg] = await Promise.all([
      sharp(master).resize(Math.max(16, Math.round(W / 8)), Math.max(16, Math.round(H / 8)), { fit: 'cover' })
        .blur(14).modulate({ brightness: 0.62, saturation: 1.15 }).resize(W, H, { fit: 'fill' }).toBuffer(),
      sharp(master).resize(fw, fh, { kernel: 'lanczos3', fit: 'fill' }).toBuffer(),
    ])
    base = sharp(bg).composite([{ input: fg, gravity: 'centre' }])
  }
  const flat = await base.removeAlpha().toBuffer()
  const [avif, webp] = await Promise.all([
    sharp(flat).avif({ quality: 55, effort: 2 }).toBuffer(),
    sharp(flat).webp({ quality: 80, effort: 4 }).toBuffer(),
  ])
  return { fit, avif, webp }
}

const EXT: Record<string, string> = { jpeg: 'jpg', png: 'png', webp: 'webp', avif: 'avif', gif: 'gif', heif: 'heic', tiff: 'tiff' }

/** Imports, checks, (conservatively) enhances and renders all variants for one ImageAsset. */
export async function processAsset(id: string, opts: { force?: boolean } = {}): Promise<{ outcome: Outcome; note?: string }> {
  const sharp = await loadSharp()
  if (!sharp) return { outcome: 'failed', note: 'image processor unavailable on this server' }
  const asset = await prisma.imageAsset.findUnique({ where: { id } })
  if (!asset) return { outcome: 'failed', note: 'asset missing' }
  const now = new Date()

  let bytes: Buffer
  try {
    bytes = await download(asset.sourceUrl)
  } catch (e: any) {
    const note = `fetch failed: ${e?.message ?? 'error'}`
    // Keep serving a previously processed version if the source is temporarily down
    await prisma.imageAsset.update({
      where: { id },
      data: asset.variants ? { checkedAt: now, note } : { status: 'FAILED', attempts: { increment: 1 }, checkedAt: now, note },
    })
    return { outcome: 'failed', note }
  }

  const contentHash = crypto.createHash('sha1').update(bytes).digest('hex')
  if (!opts.force && asset.contentHash === contentHash && asset.variants) {
    await prisma.imageAsset.update({ where: { id }, data: { checkedAt: now } })
    return { outcome: 'unchanged' }
  }
  const artworkChanged = !!asset.contentHash && asset.contentHash !== contentHash

  // Same bytes already processed under another URL: reuse its variants
  if (!opts.force) {
    const twin = await prisma.imageAsset.findFirst({
      where: { contentHash, id: { not: id }, processedAt: { not: null }, status: { in: ['OK', 'ENHANCED', 'LOW_RES', 'REVIEW'] } },
    })
    if (twin?.variants) {
      await prisma.imageAsset.update({
        where: { id },
        data: {
          contentHash, status: twin.status, width: twin.width, height: twin.height, format: twin.format, bytes: twin.bytes,
          originalPath: twin.originalPath, variants: twin.variants as any, fit: twin.fit as any, score: twin.score as any,
          enhanced: twin.enhanced, note: twin.note, processedAt: now, checkedAt: now, attempts: { increment: 1 },
        },
      })
      if (artworkChanged) await logArtworkChange(id)
      return { outcome: 'cached' }
    }
  }

  try {
    const meta = await sharp(bytes, { animated: false }).metadata()
    const fmt = meta.format ?? 'unknown'
    if (!meta.width || !meta.height || meta.width < 120 || meta.height < 80) throw new Error('not a usable image')
    // Normalise: honour EXIF rotation, sRGB, first frame only, transparent areas on white
    const norm = await sharp(bytes, { animated: false }).rotate().toColourspace('srgb')
      .flatten({ background: '#ffffff' }).png({ compressionLevel: 3 }).toBuffer({ resolveWithObject: true })
    const img = norm.data
    const w = norm.info.width, h = norm.info.height

    const sharpVal = Math.round(await sharpness(sharp, img))
    const blocky = await blockiness(sharp, img, w)
    const stats = await sharp(img).stats()
    const isBlurry = sharpVal < BLURRY
    const isBlocky = blocky !== null && blocky > BLOCKY

    let master = img, mw = w, mh = h
    let integrity: Record<string, unknown> | null = null
    let enhanced = false
    let status = 'OK'
    let note: string | null = null

    if (w < STANDARD_WIDTH) {
      {
        // Lanczos is never worse than the browser stretching the original, so soft/blocky sources are upscaled too and flagged
        const r = await enhance(sharp, img, w, h)
        integrity = r.integrity
        if (r.buf) {
          master = r.buf
          const m2 = await sharp(master).metadata()
          mw = m2.width ?? w; mh = m2.height ?? h
          enhanced = true
          status = 'ENHANCED'
        } else if (r.integrity) {
          status = 'LOW_RES'
          note = 'Enhancement rejected by integrity check - original kept'
        }
        if (isBlurry || isBlocky) {
          status = 'REVIEW'
          note = isBlurry ? 'Source is soft/blurry - a better image is recommended' : 'Heavy compression artefacts in source'
        }
      }
      if (w < MIN_WIDTH) {
        status = 'REVIEW'
        note = note ?? `Only ${w}px wide - below the ${MIN_WIDTH}px minimum`
      }
    } else if (isBlurry) {
      status = 'REVIEW'
      note = 'High resolution but soft/blurry'
    }

    const folder = storagePath(`event-images/${contentHash}`)
    const ext = EXT[fmt] ?? 'bin'
    const uploads: Promise<unknown>[] = [putObject(`${folder}/original.${ext}`, bytes, `image/${fmt === 'jpeg' ? 'jpeg' : fmt}`)]
    const sizes: VariantManifest['sizes'] = {}
    const fits: Record<string, string> = {}
    for (const kind of Object.keys(VARIANTS) as VariantKind[]) {
      const spec = VARIANTS[kind]
      // Never render a responsive width bigger than the master can honestly fill (always keep the smallest)
      const widths = spec.widths.filter((vw, i) => i === 0 || vw <= mw * 1.1)
      sizes[kind] = widths
      for (const vw of widths) {
        const vh = Math.round((vw * spec.h) / spec.w)
        const out = await renderVariant(sharp, master, mw, mh, vw, vh)
        fits[kind] = out.fit
        uploads.push(putObject(`${folder}/${kind}-${vw}.avif`, out.avif, 'image/avif'))
        uploads.push(putObject(`${folder}/${kind}-${vw}.webp`, out.webp, 'image/webp'))
      }
    }
    await Promise.all(uploads)

    const resScore = Math.min(1, w / STANDARD_WIDTH)
    const sharpScore = Math.min(1, sharpVal / 300)
    const blockScore = blocky === null ? 1 : Math.max(0, Math.min(1, (1.6 - blocky) / 0.6))
    const manifest: VariantManifest = { base: publicUrl(folder), sizes, v: 1 }
    await prisma.imageAsset.update({
      where: { id },
      data: {
        contentHash, status, width: w, height: h, format: fmt, bytes: bytes.length,
        originalPath: `${folder}/original.${ext}`, isPublic: true,
        variants: manifest as any, fit: fits as any, enhanced, note,
        score: {
          sharpness: sharpVal, blockiness: blocky === null ? null : Math.round(blocky * 100) / 100,
          entropy: Math.round(stats.entropy * 100) / 100, aspect: Math.round((w / h) * 100) / 100,
          overall: Math.round((resScore * 0.5 + sharpScore * 0.3 + blockScore * 0.2) * 100),
          integrity, formats: FORMATS,
        } as any,
        costUsd: 0, processedAt: now, checkedAt: now, attempts: { increment: 1 },
      },
    })
    if (artworkChanged) await logArtworkChange(id)
    if (status === 'ENHANCED') return { outcome: 'enhanced' }
    if (status === 'REVIEW') return { outcome: 'review', note: note ?? undefined }
    if (integrity && !enhanced) return { outcome: 'rejected', note: note ?? undefined }
    return { outcome: 'ok' }
  } catch (e: any) {
    const note = `processing failed: ${e?.message ?? 'error'}`
    await prisma.imageAsset.update({
      where: { id },
      data: asset.variants ? { checkedAt: now, note } : { status: 'FAILED', attempts: { increment: 1 }, checkedAt: now, note, contentHash },
    })
    return { outcome: 'failed', note }
  }
}

async function logArtworkChange(assetId: string) {
  const events = await prisma.event.findMany({ where: { imageAssetId: assetId }, select: { id: true, imageUrl: true }, take: 200 })
  if (!events.length) return
  await prisma.imageHistory.createMany({
    data: events.map((e) => ({ eventId: e.id, oldAssetId: assetId, newAssetId: assetId, oldUrl: e.imageUrl, newUrl: e.imageUrl, reason: 'ARTWORK_CHANGED' })),
  })
}
