import { NextResponse } from 'next/server'
import { claimCommunityEvent } from '@/lib/community'
import { getSessionUser, unauthorized } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const me = await getSessionUser().catch(() => null)
  if (!me?.email) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const result = await claimCommunityEvent(String(body?.eventId ?? ''), { id: me.id, email: me.email })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
