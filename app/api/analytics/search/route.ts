import { NextResponse } from 'next/server'
import { analyticsAllowed, ensureVisitor, quietly, recordSearch } from '@/lib/audience-track'

export const dynamic = 'force-dynamic'

/** Records that a search ran. The query text is not stored. */
export async function POST(req: Request) {
  if (!analyticsAllowed(req)) return new NextResponse(null, { status: 204 })
  const body = await req.json().catch(() => null) as { h?: unknown } | null
  const queryKey = typeof body?.h === 'string' ? body.h : ''
  const visitorId = await ensureVisitor()
  await quietly(() => recordSearch(visitorId, queryKey))
  return new NextResponse(null, { status: 204 })
}
