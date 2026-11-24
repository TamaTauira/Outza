import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { putObject, publicUrl, storagePath } from '@/lib/s3'
import { buildDisplayFromBuffer } from './display-build'
import { DISPLAY_VERSION, parseDisplayManifest } from './display-spec'

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const MAX_BYTES = 20 * 1024 * 1024
const MAX_ATTEMPTS = 3

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
    signal: AbortSignal.timeout(20000),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const len = Number(res.headers.get('content-length') ?? 0)
  if (len > MAX_BYTES) throw new Error('image too large')
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_BYTES) throw new Error('image too large')
  if (buf.length < 32) throw new Error('empty image')
  return buf
}

/**
 * Download the event's source image and store 480/960/1440 AVIF and WebP.
 * A row that is not marked pending is left untouched, so this is not a backfill.
 */
export async function prepareEventDisplay(eventId: string, opts: { force?: boolean } = {}): Promise<'stored' | 'skipped' | 'failed'> {
  const ev = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, imageUrl: true, imageLocked: true, imageDisplay: true },
  })
  const manifest = parseDisplayManifest(ev?.imageDisplay)
  if (!ev?.imageUrl || ev.imageLocked) return 'skipped'
  if (!opts.force && !manifest?.pending) return 'skipped'
  if (!opts.force && (manifest?.attempts ?? 0) >= MAX_ATTEMPTS) return 'skipped'

  try {
    const bytes = await download(ev.imageUrl)
    const hash = crypto.createHash('sha1').update(bytes).digest('hex')
    if (manifest?.hash === hash && manifest.base && manifest.widths?.length) return 'skipped'
    const built = await buildDisplayFromBuffer(bytes)
    const folder = storagePath(`event-display/${hash}`)
    await Promise.all(built.files.flatMap((file) => [
      putObject(`${folder}/w${file.width}.avif`, file.avif, 'image/avif'),
      putObject(`${folder}/w${file.width}.webp`, file.webp, 'image/webp'),
    ]))
    await prisma.event.update({
      where: { id: eventId },
      data: {
        imageWidth: built.width,
        imageHeight: built.height,
        imageColor: built.color,
        imageBlur: built.blur,
        imageDisplay: {
          v: DISPLAY_VERSION,
          pending: false,
          hash,
          base: publicUrl(folder),
          widths: built.widths,
          attempts: (manifest.attempts ?? 0) + 1,
        },
      },
    })
    return 'stored'
  } catch (err) {
    const attempts = (manifest.attempts ?? 0) + 1
    await prisma.event.update({
      where: { id: eventId },
      data: {
        imageDisplay: {
          v: DISPLAY_VERSION,
          pending: attempts < MAX_ATTEMPTS,
          attempts,
        },
      },
    }).catch(() => {})
    console.error('[images] display resize failed', eventId, err instanceof Error ? err.message : err)
    return 'failed'
  }
}

/** Resize rows this deploy marked pending. Older rows have a null manifest and are not selected. */
export async function flushPendingDisplays(opts: { limit?: number; budgetMs?: number } = {}): Promise<number> {
  const limit = opts.limit ?? 8
  const deadline = Date.now() + (opts.budgetMs ?? 12_000)
  const rows = await prisma.event.findMany({
    where: { imageUrl: { not: null }, imageDisplay: { path: ['pending'], equals: true } },
    select: { id: true, imageDisplay: true },
    orderBy: { updatedAt: 'desc' },
    take: Math.max(limit, 1) * 2,
  })
  let done = 0
  for (const row of rows) {
    if (done >= limit || Date.now() > deadline) break
    const manifest = parseDisplayManifest(row.imageDisplay)
    if ((manifest?.attempts ?? 0) >= MAX_ATTEMPTS) continue
    const outcome = await prepareEventDisplay(row.id)
    if (outcome === 'stored') done += 1
  }
  return done
}
