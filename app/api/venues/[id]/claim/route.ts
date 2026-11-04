import { NextResponse } from 'next/server'
import { getSessionUser, unauthorized } from '@/lib/session'
import { ownershipUiEnabled } from '@/lib/ownership'
import { submitVenueClaim } from '@/lib/venue-access'
import { unverifiedGate } from '@/lib/account-flow'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!ownershipUiEnabled()) return NextResponse.json({ error: 'These tools are turned off.' }, { status: 404 })
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const gate = await unverifiedGate(me.id)
  if (gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const result = await submitVenueClaim(me, id, body)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
