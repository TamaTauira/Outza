import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isLandingPath } from '@/lib/landing-attribution'
import { classifyLandingReferrer, recordLandingHit, type LandingHitKind } from '@/lib/landing-stats'
import { REFERRAL_SOURCES, type ReferralSource } from '@/lib/referral-labels'

export const dynamic = 'force-dynamic'

const PUBLIC_KINDS = new Set<LandingHitKind>(['view', 'detail', 'lead'])
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly/i

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 2,
  }
}

/**
 * Landing-page analytics. Views classify the inbound referrer and remember it.
 * Detail views and organiser-link clicks reuse that memory. Saves and claims
 * are counted from their own routes so a forged beacon cannot invent them.
 */
export async function POST(req: Request) {
  const ua = req.headers.get('user-agent') ?? ''
  if (BOT.test(ua) || /prefetch/i.test(req.headers.get('purpose') ?? '') || req.headers.get('next-router-prefetch') === '1') {
    return new NextResponse(null, { status: 204 })
  }
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'same-site' && site !== 'none') {
    return NextResponse.json({ ok: false }, { status: 403 })
  }
  const body = await req.json().catch(() => null) as { path?: unknown; kind?: unknown; referrer?: unknown; utmSource?: unknown; utmMedium?: unknown } | null
  const kind = typeof body?.kind === 'string' && PUBLIC_KINDS.has(body.kind as LandingHitKind) ? body.kind as LandingHitKind : null
  if (!kind) return NextResponse.json({ ok: false }, { status: 400 })

  const jar = await cookies()
  const cookiePath = jar.get('vp_lp')?.value
  const cookieSource = jar.get('vp_src')?.value
  const rawPath = typeof body?.path === 'string' && body.path ? body.path : kind === 'lead' ? cookiePath : ''
  let path = ''
  try { path = decodeURIComponent(rawPath ?? '') } catch { path = '' }
  if (!isLandingPath(path)) return NextResponse.json({ ok: false }, { status: 400 })

  const classified = classifyLandingReferrer(body?.referrer, { source: body?.utmSource, medium: body?.utmMedium })
  const remembered = cookieSource && (REFERRAL_SOURCES as readonly string[]).includes(cookieSource) ? cookieSource as ReferralSource : null
  const source = kind === 'view' ? classified : (remembered ?? classified)

  if (kind === 'view') {
    jar.set('vp_src', source, cookieOptions())
    jar.set('vp_lp', encodeURIComponent(path), cookieOptions())
  }
  await recordLandingHit(path, source, kind)
  return NextResponse.json({ ok: true })
}
