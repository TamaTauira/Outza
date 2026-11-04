import { NextResponse } from 'next/server'
import { resetPassword } from '@/lib/account-flow'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const token = String(body.token ?? '')
  const password = String(body.password ?? '')
  if (!token) return NextResponse.json({ error: 'That link has expired or already been used.' }, { status: 400 })
  try {
    const result = await resetPassword(token, password)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[account] reset-password', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'The password could not be changed. Try the link again.' }, { status: 500 })
  }
}
