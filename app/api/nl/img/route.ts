import { readFile } from 'fs/promises'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertPublicImageUrl, renderEmailImage, sourceForEmail, type EmailKind } from '@/lib/newsletter/images'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function mascot() {
  const body = await readFile(path.join(process.cwd(), 'public', 'vibepeep-mascot-email.png'))
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=86400',
      'x-robots-tag': 'noindex',
    },
  })
}

/** Public JPEG (or mascot PNG) for digest emails. Gmail fetches this with no cookies. */
export async function GET(req: NextRequest) {
  const kind: EmailKind = req.nextUrl.searchParams.get('k') === 'hero' ? 'hero' : 'thumb'
  const id = req.nextUrl.searchParams.get('e') ?? ''
  if (!/^[\w-]{8,40}$/.test(id)) return mascot()
  try {
    const event = await prisma.event.findUnique({
      where: { id },
      select: { id: true, imageUrl: true, imageAsset: { select: { sourceUrl: true, status: true } } },
    })
    const src = event ? assertPublicImageUrl(sourceForEmail(event)) : null
    if (!src) return mascot()
    const rendered = await renderEmailImage(src, kind)
    if (!rendered) return mascot()
    return new NextResponse(new Uint8Array(rendered.body), {
      headers: {
        'content-type': rendered.contentType,
        'cache-control': 'public, max-age=86400',
        'x-robots-tag': 'noindex',
      },
    })
  } catch (err) {
    console.error('[nl/img]', err instanceof Error ? err.message : err)
    return mascot()
  }
}
