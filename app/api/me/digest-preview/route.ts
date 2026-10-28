import { NextResponse } from 'next/server'
import { sendDigest } from '@/lib/digest'
import { getSessionUser, unauthorized } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function POST() {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const r = await sendDigest(me.id, { test: true })
  if (!r.ok) {
    const msg = 'skipped' in r && r.skipped ? 'There aren’t enough upcoming events for your city right now. Try adding more cities or categories.' : 'Could not send the email right now. Please try again later.'
    return NextResponse.json({ error: msg }, { status: 'skipped' in r && r.skipped ? 422 : 502 })
  }
  return NextResponse.json({ ok: true, disabled: 'disabled' in r && !!r.disabled })
}
