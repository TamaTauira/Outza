import { NextResponse } from 'next/server'
import { getSessionUser, unauthorized } from '@/lib/session'
import { ownershipUiEnabled } from '@/lib/ownership'
import { reportVenueEvent } from '@/lib/venue-access'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!ownershipUiEnabled()) return NextResponse.json({ error: 'These tools are turned off.' }, { status: 404 })
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const result = await reportVenueEvent(me.id, id, body)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
