import { NextResponse } from 'next/server'
import { getSessionUser, unauthorized } from '@/lib/session'
import { missingTable } from '@/lib/sponsorship-store'
import { outstandingFor, recordAcceptance } from '@/lib/terms-accept'

export const dynamic = 'force-dynamic'

const CONTEXTS = new Set(['login', 'signup', 'checkout'])

export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const context = CONTEXTS.has(body?.context) ? body.context : 'login'
  try {
    const missing = await outstandingFor(me.id, me.role)
    await recordAcceptance(me.id, missing, context)
    return NextResponse.json({ ok: true, accepted: missing })
  } catch (error) {
    if (missingTable(error)) {
      return NextResponse.json({ error: 'Terms acceptance cannot be stored until the update is applied.' }, { status: 503 })
    }
    throw error
  }
}
