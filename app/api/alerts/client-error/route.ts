import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { noteTransientNetwork, reportFault } from '@/lib/owner-alerts'
import { isBareNetworkFault, transientSessionId } from '@/lib/network-fault'

export const dynamic = 'force-dynamic'

const hits = new Map<string, number[]>()

function sameOrigin(req: Request) {
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(',')[0].trim()
  if (!host) return false
  const source = req.headers.get('origin') || req.headers.get('referer')
  if (!source) return false
  try { return new URL(source).host === host } catch { return false }
}

function fallbackSession(ip: string, ua: string) {
  return createHash('sha1').update(`${ip}\n${ua}`).digest('hex').slice(0, 20)
}

/**
 * Page crashes caught by the app's error boundaries, plus stackless fetch
 * failures forwarded by the same reporter. Same-origin (or a shared key) and
 * rate-limited.
 *
 * "Load failed" / "Failed to fetch" / Firefox's NetworkError / "The network
 * connection was lost" / AbortError, with no stack, are a dropped connection.
 * They are counted and do not email as a page crash. A spike of distinct
 * sessions still emails, under area Network. A crash that has a stack emails
 * as before.
 */
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
  const name = typeof b.name === 'string' ? b.name.slice(0, 80) : ''
  const stack = typeof b.stack === 'string' ? b.stack : ''
  let path = String(b.path ?? '').slice(0, 200)
  try { path = new URL(path, 'http://x').pathname } catch {}
  const route = path.replace(/\/[^/]*-?c[a-z0-9]{20,}$/i, '/[id]')
  const ua = (req.headers.get('user-agent') ?? '').slice(0, 200)
  if (isBareNetworkFault({ message, name, stack })) {
    const session = transientSessionId(b.session) ?? fallbackSession(ip, ua)
    await noteTransientNetwork({ route: route || path || '/', message, sessionId: session, page: path || '/' })
    return NextResponse.json({ ok: true, transient: true })
  }
  await reportFault({
    area: 'Page crash',
    key: `client-${route}-${message.slice(0, 120)}`,
    route: route || path || '/',
    title: `${route || '/'}: ${message.slice(0, 120)}`,
    error: message,
    stack,
    detail: `Page: ${path}\nBrowser: ${ua}${b.digest ? `\nDigest: ${String(b.digest).slice(0, 60)}` : ''}\n\n${stack.slice(0, 3000)}`,
  })
  return NextResponse.json({ ok: true })
}
