export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { refreshSources } from '@/lib/refresh'

/** POST /api/refresh-events?source=Ticketmaster or ?sources=Moshtix,Oztix or ?finalize=1 */
export async function POST(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const raw = sp.get('sources') ?? sp.get('source') ?? ''
    const sources = raw.split(',').map((s) => s.trim()).filter(Boolean)
    const finalize = sp.get('finalize') === '1'
    const { eventsAdded, errors, sourcesRun } = await refreshSources({
      ...(sources.length ? { sources } : {}),
      ...(finalize ? { finalize: true } : {}),
    })
    return NextResponse.json({ success: true, eventsAdded, errors, sourcesRun })
  } catch (err: any) {
    console.error('Refresh failed:', err?.message)
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 })
  }
}
