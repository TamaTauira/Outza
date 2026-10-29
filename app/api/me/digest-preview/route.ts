import { NextResponse } from 'next/server'
import { sendDigest } from '@/lib/digest'
import { publicEmailError } from '@/lib/email'
import { getSessionUser, unauthorized } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function POST() {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const r = await sendDigest(me.id, { test: true })
  if (!r.ok) {
    const skipped = 'skipped' in r && r.skipped
    const blocked = 'blocked' in r && r.blocked
    const restricted = 'restricted' in r && r.restricted
    const msg = skipped
      ? 'There aren’t enough upcoming events for your city right now. Try adding more cities or categories.'
      : blocked
        ? (r.error ?? 'This issue was blocked by a content check.')
        : publicEmailError('error' in r ? r.error : undefined)
    const status = skipped || blocked ? 422 : restricted ? 403 : 502
    return NextResponse.json({ error: msg, restricted: !!restricted }, { status })
  }
  return NextResponse.json({ ok: true, disabled: 'disabled' in r && !!r.disabled })
}
