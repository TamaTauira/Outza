export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { refreshAllSources } from '@/lib/refresh'

export async function POST() {
  try {
    const { eventsAdded, errors } = await refreshAllSources()
    return NextResponse.json({ success: true, eventsAdded, errors })
  } catch (err: any) {
    console.error('Refresh failed:', err?.message)
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 })
  }
}
