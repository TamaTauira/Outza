import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { readUnsubscribeFields, verify } from '@/lib/newsletter/links'

export const dynamic = 'force-dynamic'

/** Turns off the monthly venue note. Does not touch the newsletter. */
export async function POST(req: Request) {
  const body = await readUnsubscribeFields(req)
  const userId = body.u
  const key = body.k
  if (!userId || !verify(key, userId, 'venue-report-unsub')) {
    return NextResponse.json({ error: 'This unsubscribe link is invalid. You can turn the monthly note off from the venue dashboard.' }, { status: 400 })
  }
  await prisma.user.update({ where: { id: userId }, data: { venueMonthlyOptOut: true } }).catch(() => null)
  return NextResponse.json({ ok: true })
}
