import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Credential check endpoint; the browser session itself is created via signIn('credentials').
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null
  if (!user?.password || !(await bcrypt.compare(password, user.password))) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }
  return NextResponse.json({ ok: true, user: { id: user.id, email: user.email, role: user.role } })
}
