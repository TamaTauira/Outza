import { NextResponse } from 'next/server'
import { isSurface, normalizeSearchTerm } from '@/lib/organiser-reach'
import { recordSeen } from '@/lib/product-metrics'

export const dynamic = 'force-dynamic'

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly/i

/** First-party appearance beacon. One session on the board, map, search or Hot right now. */
export async function POST(req: Request) {
  const ua = req.headers.get('user-agent') ?? ''
  if (BOT.test(ua) || /prefetch/i.test(req.headers.get('purpose') ?? '') || req.headers.get('next-router-prefetch') === '1') {
    return new NextResponse(null, { status: 204 })
  }
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'same-site' && site !== 'none') {
    return NextResponse.json({ ok: false }, { status: 403 })
  }
  const body = await req.json().catch(() => null) as { surface?: unknown; ids?: unknown; term?: unknown; spotlightIds?: unknown } | null
  const surface = typeof body?.surface === 'string' && isSurface(body.surface) ? body.surface : null
  if (!surface) return NextResponse.json({ ok: false }, { status: 400 })
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length < 80).slice(0, 12) : []
  const spotlightIds = Array.isArray(body?.spotlightIds) ? body.spotlightIds.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length < 80).slice(0, 12) : []
  const term = typeof body?.term === 'string' ? normalizeSearchTerm(body.term) : null
  if (ids.length) await recordSeen(ids, surface, term)
  if (spotlightIds.length) await recordSeen(spotlightIds, 'spotlight')
  return NextResponse.json({ ok: true })
}
