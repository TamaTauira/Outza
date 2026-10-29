import { NextResponse } from 'next/server'
import { getSessionUser, unauthorized } from '@/lib/session'
import { sendWatchDigest } from '@/lib/watch-mail'

export const dynamic = 'force-dynamic'

export async function POST() {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const result = await sendWatchDigest(me.id, { test: true })
  if (!result.ok) {
    if ('disabled' in result && result.disabled) return NextResponse.json({ error: 'Email sending is turned off until RESEND_API_KEY is set.' }, { status: 503 })
    if ('skipped' in result && result.skipped) return NextResponse.json({ error: 'Save an event or follow a venue first, so the preview has something to say.' }, { status: 422 })
    return NextResponse.json({ error: 'Could not send the preview.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
