import { NextResponse } from 'next/server'
import { bumpCounter } from '@/lib/data-health'

export const dynamic = 'force-dynamic'

/** Counts a click from search results. No personal data is stored. */
export async function POST() {
  await bumpCounter('search_result_clicks').catch((e) => console.error('search click failed', e?.message))
  return NextResponse.json({ ok: true })
}
