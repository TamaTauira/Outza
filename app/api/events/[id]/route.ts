export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getEventDetail } from '@/lib/event-detail'
import { idFromEventParam } from '@/lib/seo'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const data = (await getEventDetail(id)) ?? (id.includes('-') ? await getEventDetail(idFromEventParam(id)) : null)
    if (!data) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
    return NextResponse.json(data)
  } catch (err: any) {
    console.error('Error fetching event:', err?.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
