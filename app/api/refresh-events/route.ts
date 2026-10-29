export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { refreshSources } from '@/lib/refresh'
import { REFRESH_CHUNKS, REFRESH_INVOCATION_BUDGET_MS } from '@/lib/refresh-plan'

/** POST /api/refresh-events?source=Ticketmaster or ?sources=Moshtix,Oztix or ?finalize=1 */
export async function POST(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const raw = sp.get('sources') ?? sp.get('source') ?? ''
    const sources = raw.split(',').map((s) => s.trim()).filter(Boolean)
    const finalize = sp.get('finalize') === '1'
    if (finalize && sources.length) {
      return NextResponse.json({ success: false, error: 'Run sources and finalize=1 as separate requests so each stays inside the function limit.' }, { status: 400 })
    }
    if (!finalize && !sources.length) {
      return NextResponse.json({
        success: false,
        error: 'Pass source, sources, or finalize=1. A full refresh is split across /api/cron/refresh/<chunk>.',
        chunks: REFRESH_CHUNKS.map((c) => c.id),
      }, { status: 400 })
    }
    const { eventsAdded, errors, sourcesRun, cycleOk } = await refreshSources({
      ...(sources.length ? { sources, chunk: true, invocationBudgetMs: REFRESH_INVOCATION_BUDGET_MS } : {}),
      ...(finalize ? { finalize: true, chunk: true } : {}),
    })
    return NextResponse.json({ success: true, eventsAdded, errors, sourcesRun, cycleOk: cycleOk ?? null })
  } catch (err: any) {
    console.error('Refresh failed:', err?.message)
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 })
  }
}
