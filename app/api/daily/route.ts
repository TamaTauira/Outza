import { NextRequest, NextResponse } from 'next/server'
import { loadDailyBriefing } from '@/lib/daily-briefing-store'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const city = req.nextUrl.searchParams.get('city') ?? ''
  const edition = req.nextUrl.searchParams.get('edition') ?? 'today'
  try {
    const body = await loadDailyBriefing(city, edition)
    if ('error' in body && body.error) return NextResponse.json(body, { status: 400 })
    return NextResponse.json(body)
  } catch (err) {
    console.error('daily briefing failed', (err as Error)?.message)
    return NextResponse.json({ enabled: true, empty: 'The briefing could not be loaded.', items: [] }, { status: 500 })
  }
}
