import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verify } from '@/lib/newsletter/links'

export const dynamic = 'force-dynamic'

/** One-click unsubscribe from the signed link in every newsletter (no sign-in needed). */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}))
  const u = typeof b.u === 'string' ? b.u : ''
  if (!u || !verify(b.k, u, 'unsub')) return NextResponse.json({ error: 'This unsubscribe link is invalid or has expired. You can turn emails off in your account settings.' }, { status: 400 })
  const user = await prisma.user.findUnique({ where: { id: u }, select: { id: true } })
  if (!user) return NextResponse.json({ error: 'Subscriber not found' }, { status: 404 })
  await prisma.user.update({ where: { id: u }, data: { emailOptIn: false } })
  if (typeof b.s === 'string' && b.s) {
    const send = await prisma.newsletterSend.findFirst({ where: { id: b.s, userId: u }, select: { id: true } })
    if (send) await prisma.newsletterClick.create({ data: { sendId: send.id, placement: 'footer', target: 'unsubscribe' } }).catch(() => {})
  }
  return NextResponse.json({ ok: true })
}
