import { NextResponse } from 'next/server'
import { reportFault } from '@/lib/owner-alerts'

export const dynamic = 'force-dynamic'

const hits = new Map<string, number[]>()

function sameOrigin(req: Request) {
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(',')[0].trim()
  if (!host) return false
  const source = req.headers.get('origin') || req.headers.get('referer')
  if (!source) return false
  try { return new URL(source).host === host } catch { return false }
}

/** Page crashes caught by the app's error boundaries. Same-origin (or a shared key) and rate-limited. */
export async function POST(req: Request) {
  const token = process.env.CLIENT_ERROR_TOKEN || process.env.NEXT_PUBLIC_CLIENT_ERROR_TOKEN
  if (token) {
    if (req.headers.get('x-outza-report-key') !== token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  } else if (!sameOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000)
  if (recent.length >= 5) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  hits.set(ip, [...recent, now])

  const b = await req.json().catch(() => ({}))
  const message = String(b.message ?? '').slice(0, 300)
  if (!message) return NextResponse.json({ error: 'Missing message' }, { status: 400 })
  let path = String(b.path ?? '').slice(0, 200)
  try { path = new URL(path, 'http://x').pathname } catch {}
  const route = path.replace(/\/[^/]*-?c[a-z0-9]{20,}$/i, '/[id]')
  await reportFault({
    area: 'Page crash',
    key: `client-${route}-${message.slice(0, 120)}`,
    route: route || path || '/',
    title: `${route || '/'}: ${message.slice(0, 120)}`,
    error: message,
    stack: String(b.stack ?? ''),
    detail: `Page: ${path}\nBrowser: ${(req.headers.get('user-agent') ?? '').slice(0, 200)}${b.digest ? `\nDigest: ${String(b.digest).slice(0, 60)}` : ''}\n\n${String(b.stack ?? '').slice(0, 3000)}`,
  })
  return NextResponse.json({ ok: true })
}
