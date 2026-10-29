import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** Permanently deletes the signed-in account. The body must repeat the account email. */
export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const b = await req.json().catch(() => ({}))
  const confirm = String(b.confirm ?? '').trim().toLowerCase()
  if (!me.email || confirm !== me.email.toLowerCase()) {
    return NextResponse.json({ error: 'Type your account email to close it' }, { status: 400 })
  }
  await prisma.user.delete({ where: { id: me.id } })
  return NextResponse.json({ ok: true })
}
