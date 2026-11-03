import { NextResponse } from 'next/server'
import { eventPerformance } from '@/lib/event-performance'
import { getSessionUser, unauthorized } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const { id } = await params
  const result = await eventPerformance(me.id, id, me.role === 'ADMIN')
  if (result.status !== 200) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result.performance)
}
