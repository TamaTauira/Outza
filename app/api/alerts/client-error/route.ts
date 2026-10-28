import { NextResponse } from 'next/server'
import { reportFault } from '@/lib/owner-alerts'

export const dynamic = 'force-dynamic'

const hits = new Map<string, number[]>()

/** Page crashes caught by the app's error boundaries. Rate-limited per IP; faults are deduped in reportFault. */
export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000)
  if (recent.length >= 5) return NextResponse.json({ ok: true })
  hits.set(ip, [...recent, now])

  const b = await req.json().catch(() => ({}))
  const message = String(b.message ?? '').slice(0, 300)
  if (!message) return NextResponse.json({ ok: true })
  let path = String(b.path ?? '').slice(0, 200)
  try { path = new URL(path, 'http://x').pathname } catch {}
  const route = path.replace(/\/[^/]*-?c[a-z0-9]{20,}$/i, '/[id]')
  await reportFault({
    area: 'Page crash',
    key: `client-${route}-${message.slice(0, 120)}`,
    title: `${route || '/'}: ${message.slice(0, 120)}`,
    detail: `Page: ${path}\nBrowser: ${(req.headers.get('user-agent') ?? '').slice(0, 200)}${b.digest ? `\nDigest: ${String(b.digest).slice(0, 60)}` : ''}\n\n${String(b.stack ?? '').slice(0, 3000)}`,
  })
  return NextResponse.json({ ok: true })
}
