import { NextResponse } from 'next/server'
import { analyticsAllowed, ensureVisitor, quietly, recordAudience } from '@/lib/audience-track'

export const dynamic = 'force-dynamic'

/** One presence mark for today. The id is an anonymous cookie, not an account. */
export async function POST(req: Request) {
  if (!analyticsAllowed(req)) return new NextResponse(null, { status: 204 })
  const visitorId = await ensureVisitor()
  await quietly(() => recordAudience(visitorId))
  return new NextResponse(null, { status: 204 })
}
