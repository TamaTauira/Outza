import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}))
  const message = String(b.message ?? '').trim().slice(0, 4000)
  if (message.length < 5) return NextResponse.json({ error: 'Please write a little more about your idea' }, { status: 400 })
  const me = await getSessionUser().catch(() => null)
  const role = b.role === 'PROMOTER' ? 'PROMOTER' : 'CONSUMER'
  const name = String(b.name ?? me?.name ?? '').trim().slice(0, 100) || null
  const email = String(b.email ?? me?.email ?? '').trim().slice(0, 200) || null

  // No per-suggestion email: ideas go out in the owner's fortnightly summary (lib/owner-alerts.ts).
  await prisma.suggestion.create({ data: { userId: me?.id ?? null, name, email, role, message } })
  return NextResponse.json({ ok: true })
}
