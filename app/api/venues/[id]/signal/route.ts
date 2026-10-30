import { NextResponse } from 'next/server'
import { bumpVenueMetric } from '@/lib/venue-access'

export const dynamic = 'force-dynamic'

const KINDS: Record<string, string> = {
  view: 'PROFILE_VIEWS',
  website: 'WEBSITE_CLICKS',
  directions: 'DIRECTIONS_CLICKS',
  share: 'SHARES',
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const metric = KINDS[String(body?.kind || '')]
  if (!metric) return NextResponse.json({ error: 'Unknown signal' }, { status: 400 })
  await bumpVenueMetric(id, metric).catch(() => {})
  return NextResponse.json({ ok: true })
}
