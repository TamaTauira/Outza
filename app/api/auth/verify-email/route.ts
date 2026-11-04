import { NextResponse } from 'next/server'
import { resendVerification, verifyEmail } from '@/lib/account-flow'
import { getSessionUser, unauthorized } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  if (body.resend === true) {
    const me = await getSessionUser()
    if (!me) return unauthorized()
    const result = await resendVerification(me.id)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result)
  }
  const token = String(body.token ?? '')
  if (!token) return NextResponse.json({ error: 'That link has expired or already been used.' }, { status: 400 })
  const result = await verifyEmail(token)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
