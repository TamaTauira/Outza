import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
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
      select: { id: true, category: true, imageUrl: true, imageAsset: { select: { sourceUrl: true, status: true } } },
    })
    const src = event ? assertPublicImageUrl(sourceForEmail(event)) : null
    if (!src) return placeholder(event?.category ?? 'Event', kind)
    const rendered = await renderEmailImage(src, kind)
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
