import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { displayMasterUrl, eventPictureFrom } from '@/lib/images/display-spec'
import { assertPublicImageUrl, categoryFillJpeg, renderEmailImage, sourceForEmail, type EmailKind } from '@/lib/newsletter/images'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function placeholder(category: string, kind: EmailKind) {
  const rendered = await categoryFillJpeg(category || 'Event', kind)
  if (!rendered) return new NextResponse(null, { status: 404, headers: { 'x-robots-tag': 'noindex' } })
  return new NextResponse(new Uint8Array(rendered.body), {
    headers: {
      'content-type': rendered.contentType,
      'cache-control': 'public, max-age=86400',
      'x-robots-tag': 'noindex',
    },
  })
}

/** Public JPEG for digest emails. Gmail fetches this with no cookies. Missing art is a category block, never the mascot. */
export async function GET(req: NextRequest) {
  const kind: EmailKind = req.nextUrl.searchParams.get('k') === 'hero' ? 'hero' : 'thumb'
  const id = req.nextUrl.searchParams.get('e') ?? ''
  if (!/^[\w-]{8,40}$/.test(id)) return placeholder('Event', kind)
  try {
    const event = await prisma.event.findUnique({
      where: { id },
      select: {
        id: true,
        category: true,
        imageUrl: true,
        imageColor: true,
        imageWidth: true,
        imageHeight: true,
        imageDisplay: true,
        imageAsset: { select: { sourceUrl: true, status: true } },
      },
    })
    const picture = event ? eventPictureFrom(event) : null
    const fromDisplay = picture ? assertPublicImageUrl(displayMasterUrl(picture, 'webp')) : null
    const fromSource = event ? assertPublicImageUrl(sourceForEmail(event)) : null
    const src = fromDisplay || fromSource
    if (!src) return placeholder(event?.category ?? 'Event', kind)
    let rendered = await renderEmailImage(src, kind, event?.imageColor)
    if (!rendered && fromDisplay && fromSource && fromSource !== fromDisplay) {
      rendered = await renderEmailImage(fromSource, kind, event?.imageColor)
    }
    if (!rendered) return placeholder(event?.category ?? 'Event', kind)
    return new NextResponse(new Uint8Array(rendered.body), {
      headers: {
        'content-type': rendered.contentType,
        'cache-control': 'public, max-age=86400',
        'x-robots-tag': 'noindex',
      },
    })
  } catch (err) {
    console.error('[nl/img]', err instanceof Error ? err.message : err)
    return placeholder('Event', kind)
  }
}
