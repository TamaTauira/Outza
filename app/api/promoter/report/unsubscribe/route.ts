import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verify } from '@/lib/newsletter/links'

export const dynamic = 'force-dynamic'

/** Turns off the weekly promoter recap. Does not touch the newsletter. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { u?: unknown; k?: unknown }
  const userId = typeof body.u === 'string' ? body.u : ''
  const key = typeof body.k === 'string' ? body.k : ''
  if (!userId || !verify(key, userId, 'report-unsub')) {
    return NextResponse.json({ error: 'This unsubscribe link is invalid or has expired. You can turn the weekly recap off in the promoter dashboard.' }, { status: 400 })
  }
  await prisma.user.update({ where: { id: userId }, data: { weeklyReport: false } }).catch(() => null)
  return NextResponse.json({ ok: true })
}
