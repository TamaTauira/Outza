import { NextResponse } from 'next/server'
import { isReactionKind } from '@/lib/reactions'
import { reactionState, setReaction } from '@/lib/reactions-store'
import { getSessionUser, unauthorized } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser().catch(() => null)
  const state = await reactionState(me?.id ?? null, id)
  return NextResponse.json(state)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  if (!isReactionKind(body?.kind) || typeof body?.on !== 'boolean') {
    return NextResponse.json({ error: 'Unknown reaction' }, { status: 400 })
  }
  const result = await setReaction(me.id, id, body.kind, body.on)
  if (result.status !== 200) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
