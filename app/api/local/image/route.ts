import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import sharp from 'sharp'
import { publicUrl, putObject, storagePath } from '@/lib/s3'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 8 * 1024 * 1024
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif']

/**
 * POST multipart `image`: the lister's own photo or flyer. Re-encoded to near-lossless WebP (max 2400px, EXIF/GPS stripped)
 * so it can act as the pipeline's original, stored publicly under local-images/<sha1>.webp. Display variants are made
 * by the shared image pipeline once the listing is saved. Returns { cloud_storage_path, url }.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData().catch(() => null)
    const file = form?.get('image')
    if (!file || typeof file === 'string') return NextResponse.json({ error: 'Please choose an image.' }, { status: 400 })
    if (!TYPES.includes(file.type)) return NextResponse.json({ error: 'Please upload a JPG, PNG, WebP or HEIC image.' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That image is over 8 MB. Please choose a smaller one.' }, { status: 400 })
    const input = Buffer.from(await file.arrayBuffer())
    const out = await sharp(input).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 92 }).toBuffer()
      .catch(() => null)
    if (!out) return NextResponse.json({ error: 'We couldn’t read that image. Try a JPG or PNG.' }, { status: 400 })
    const path = storagePath(`local-images/${createHash('sha1').update(out).digest('hex')}.webp`)
    await putObject(path, out, 'image/webp')
    return NextResponse.json({ cloud_storage_path: path, url: publicUrl(path) })
  } catch (err: any) {
    console.error('Local image upload failed:', err?.message)
    return NextResponse.json({ error: 'Image upload failed. Please try again.' }, { status: 500 })
  }
}
