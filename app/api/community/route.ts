import { NextResponse } from 'next/server'
import { submitCommunity } from '@/lib/community'
import { getSessionUser } from '@/lib/session'
import { unverifiedGate } from '@/lib/account-flow'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const me = await getSessionUser().catch(() => null)
    if (me) {
      const gate = await unverifiedGate(me.id)
      if (gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
    }
    const result = await submitCommunity(body, req, me?.id ?? null)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result)
  } catch (err: unknown) {
    console.error('community submit failed', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not save your listing. Try again.' }, { status: 500 })
  }
}
