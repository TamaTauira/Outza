import type { Sharp } from 'sharp'
import type sharpDefault from 'sharp'

type SharpFn = typeof sharpDefault

/** Laplacian variance on a 512px-wide greyscale copy. Higher = sharper. */
export async function sharpness(sharp: SharpFn, img: Buffer): Promise<number> {
  const { data } = await sharp(img).greyscale().resize({ width: 512, withoutEnlargement: true })
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 })
    .raw().toBuffer({ resolveWithObject: true })
  let sum = 0, sq = 0
  for (let i = 0; i < data.length; i++) { sum += data[i]; sq += data[i] * data[i] }
  const mean = sum / data.length
  return sq / data.length - mean * mean
}

/**
 * JPEG blockiness: mean luminance step across 8px block boundaries vs inside blocks, on the
 * untouched original grid. ~1.0 = clean, >1.35 = visible compression blocks.
 */
export async function blockiness(sharp: SharpFn, img: Buffer, width: number): Promise<number | null> {
  if (width > 2600) return null
  const { data, info } = await sharp(img).greyscale().raw().toBuffer({ resolveWithObject: true })
  const W = info.width, H = info.height
  let edge = 0, edgeN = 0, inner = 0, innerN = 0
  for (let y = 0; y < H; y += 2) {
    const row = y * W
    for (let x = 1; x < W; x++) {
      const d = Math.abs(data[row + x] - data[row + x - 1])
      if (x % 8 === 0) { edge += d; edgeN++ } else { inner += d; innerN++ }
    }
  }
  if (!edgeN || !innerN || inner === 0) return null
  return (edge / edgeN) / (inner / innerN)
}

/** 64-bit difference hash. */
export async function dHash(sharp: SharpFn, img: Buffer | Sharp): Promise<bigint> {
  const pipeline = Buffer.isBuffer(img) ? sharp(img) : img.clone()
  const { data } = await pipeline.greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
  let h = BigInt(0)
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    h = (h << BigInt(1)) | (data[y * 9 + x] > data[y * 9 + x + 1] ? BigInt(1) : BigInt(0))
  }
  return h
}

export function hamming(a: bigint, b: bigint): number {
  let x = a ^ b, n = 0
  while (x) { n += Number(x & BigInt(1)); x >>= BigInt(1) }
  return n
}

/** PSNR (dB) between two same-size RGB raw buffers. */
export function psnr(a: Buffer, b: Buffer): number {
  const n = Math.min(a.length, b.length)
  let se = 0
  for (let i = 0; i < n; i++) { const d = a[i] - b[i]; se += d * d }
  const mse = se / n
  return mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse)
}

export function meanColourShift(a: Buffer, b: Buffer): number {
  const n = Math.min(a.length, b.length)
  const s = [0, 0, 0]
  for (let i = 0; i < n; i++) s[i % 3] += a[i] - b[i]
  return Math.max(...s.map((v) => Math.abs(v / (n / 3))))
}
