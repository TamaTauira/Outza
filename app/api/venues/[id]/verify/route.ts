import { NextResponse } from 'next/server'
import { ownershipUiEnabled } from '@/lib/ownership'
import { verifyVenueCode } from '@/lib/venue-access'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!ownershipUiEnabled()) return NextResponse.json({ error: 'These tools are turned off.' }, { status: 404 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const result = await verifyVenueCode({ code: body?.code, token: body?.token, claimId: body?.claimId })
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  if (result.venueId && result.venueId !== id) return NextResponse.json({ error: 'That code is for a different venue.' }, { status: 400 })
  return NextResponse.json(result)
}
