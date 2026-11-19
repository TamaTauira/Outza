import { NextResponse } from 'next/server'
import { getSessionUser, unauthorized } from '@/lib/session'
import { ownershipUiEnabled } from '@/lib/ownership'
import { venueSpotlightResults } from '@/lib/venue-spotlight'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!ownershipUiEnabled()) return NextResponse.json({ error: 'These tools are turned off.' }, { status: 404 })
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const { id } = await params
  const result = await venueSpotlightResults(me.id, id)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
