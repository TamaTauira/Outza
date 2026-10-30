import { NextResponse } from 'next/server'
import { ownershipUiEnabled } from '@/lib/ownership'
import { verifyVenueCode } from '@/lib/venue-access'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!ownershipUiEnabled()) return NextResponse.json({ error: 'These tools are turned off.' }, { status: 404 })
  const body = await req.json().catch(() => ({}))
  const result = await verifyVenueCode({ code: body?.code, token: body?.token, claimId: body?.claimId })
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
