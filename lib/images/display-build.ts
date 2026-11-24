import { displayWidths } from './display-spec'
import { loadSharp } from './pipeline'

export interface BuiltDisplay {
  width: number
  height: number
  color: string
  blur: string
  widths: number[]
  files: { width: number; avif: Buffer; webp: Buffer }[]
}

function channel(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
}

/** Resize one source buffer. Never enlarges. Throws if sharp or the bytes are unusable. */
export async function buildDisplayFromBuffer(bytes: Buffer): Promise<BuiltDisplay> {
  const sharp = await loadSharp()
  if (!sharp) throw new Error('image processor unavailable')
  const meta = await sharp(bytes, { animated: false, failOn: 'none' }).rotate().metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (width < 32 || height < 32) throw new Error('not a usable image')
  const widths = displayWidths(width)
  if (!widths.length) throw new Error('not a usable image')

  const stats = await sharp(bytes, { animated: false, failOn: 'none' }).rotate().stats()
  const dominant = stats.dominant ?? {
    r: stats.channels[0]?.mean ?? 17,
    g: stats.channels[1]?.mean ?? 14,
    b: stats.channels[2]?.mean ?? 22,
  }
  const color = `#${channel(dominant.r)}${channel(dominant.g)}${channel(dominant.b)}`
  const blurBuf = await sharp(bytes, { animated: false, failOn: 'none' })
    .rotate()
    .resize(8, 8, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 40 })
    .toBuffer()
  const blur = `data:image/webp;base64,${blurBuf.toString('base64')}`

  const files: BuiltDisplay['files'] = []
  for (const target of widths) {
    const pipeline = () => sharp(bytes, { animated: false, failOn: 'none' })
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize({ width: target, withoutEnlargement: true })
    const [avif, webp] = await Promise.all([
      pipeline().avif({ quality: 50, effort: 4 }).toBuffer(),
      pipeline().webp({ quality: 75, effort: 4 }).toBuffer(),
    ])
    files.push({ width: target, avif, webp })
  }
  return { width, height, color, blur, widths, files }
}
