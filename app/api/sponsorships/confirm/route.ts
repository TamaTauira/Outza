import { NextResponse } from 'next/server'
import { getSessionUser, unauthorized } from '@/lib/session'
import { confirmCheckoutSession } from '@/lib/sponsorship-billing'

export const dynamic = 'force-dynamic'

/** Server-side check of a Stripe Checkout session after the browser returns. Idempotent with the webhook. */
export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
  if (!sessionId.startsWith('cs_')) return NextResponse.json({ error: 'Missing checkout session.' }, { status: 400 })
  try {
    const result = await confirmCheckoutSession(sessionId, me.id)
    return NextResponse.json(result, { status: result.ok ? 200 : 402 })
  } catch (error) {
    console.error('[sponsorship] confirm', error)
    return NextResponse.json({ error: 'Could not confirm that payment yet.' }, { status: 502 })
  }
}
