import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { passwordError } from '@/lib/passwords'

export const dynamic = 'force-dynamic'

/** Change the password on an email/password account. */
export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const b = await req.json().catch(() => ({}))
  const current = String(b.current ?? '')
  const next = String(b.next ?? '')
  const weak = passwordError(next)
  if (weak) return NextResponse.json({ error: weak }, { status: 400 })
  const user = await prisma.user.findUnique({ where: { id: me.id }, select: { password: true } })
  if (!user?.password) return NextResponse.json({ error: 'This account signs in with Google, so there is no password to change' }, { status: 400 })
  const ok = await bcrypt.compare(current, user.password)
  if (!ok) return NextResponse.json({ error: 'Current password doesn’t match' }, { status: 400 })
  await prisma.user.update({ where: { id: me.id }, data: { password: await bcrypt.hash(next, 10) } })
  return NextResponse.json({ ok: true })
}
