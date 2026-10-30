import { NextResponse } from 'next/server'
import { getSessionUser, unauthorized } from '@/lib/session'
import { ownershipUiEnabled } from '@/lib/ownership'
import { venueAnalytics } from '@/lib/venue-access'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!ownershipUiEnabled()) return NextResponse.json({ error: 'These tools are turned off.' }, { status: 404 })
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const { id } = await params
  const url = new URL(req.url)
  const result = await venueAnalytics(me.id, id, url.searchParams.get('range') || '30', url.searchParams.get('from'), url.searchParams.get('to'))
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
