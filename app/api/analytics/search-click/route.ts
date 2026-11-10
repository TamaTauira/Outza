import { NextResponse } from 'next/server'
import { analyticsAllowed, ensureVisitor, quietly, recordSearchClick } from '@/lib/audience-track'
import { bumpCounter } from '@/lib/data-health'

export const dynamic = 'force-dynamic'

/** Counts a click from search results. No personal data is stored. */
export async function POST(req: Request) {
  await bumpCounter('search_result_clicks').catch((e) => console.error('search click failed', e?.message))
  if (analyticsAllowed(req)) {
    const visitorId = await ensureVisitor()
    await quietly(() => recordSearchClick(visitorId))
  }
  return NextResponse.json({ ok: true })
}
