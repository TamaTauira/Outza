import { NextResponse } from 'next/server'
import { analyticsAllowed, ensureVisitor, quietly, recordSearchClick } from '@/lib/audience-track'

export const dynamic = 'force-dynamic'

/** An event opened from Ask VibePeep or the map while a search is still warm. */
export async function POST(req: Request) {
  if (!analyticsAllowed(req)) return new NextResponse(null, { status: 204 })
  const visitorId = await ensureVisitor()
  await quietly(() => recordSearchClick(visitorId))
  return new NextResponse(null, { status: 204 })
}
