import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { readUnsubscribeFields, verify } from '@/lib/newsletter/links'

export const dynamic = 'force-dynamic'

/** One-click unsubscribe. Accepts JSON from the page and an RFC 8058 form POST. */
export async function POST(req: Request) {
  const b = await readUnsubscribeFields(req)
  const u = b.u
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
