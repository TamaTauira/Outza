import { NextResponse } from 'next/server'
import { opsReadAuthorized } from '@/lib/ops/read-auth'
import { opsSummary } from '@/lib/ops/summary'

export const dynamic = 'force-dynamic'

/** Read-only health feed. Bearer OPS_READ_TOKEN. No write methods. */
export async function GET(req: Request) {
  if (!opsReadAuthorized(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 401 })
  try {
    return NextResponse.json(await opsSummary())
  } catch (err) {
    console.error('[ops] summary failed', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Summary unavailable' }, { status: 500 })
  }
}
