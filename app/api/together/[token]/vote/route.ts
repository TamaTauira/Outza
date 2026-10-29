import { NextResponse } from 'next/server'
import { validToken } from '@/lib/together'
import { actor, castVote } from '@/lib/together-server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!validToken(token)) return NextResponse.json({ error: 'That invite link does not look right' }, { status: 400 })
  const body = await req.json().catch(() => ({}))
  if (typeof body.itemId !== 'string' || !body.itemId) return NextResponse.json({ error: 'Choose an option' }, { status: 400 })
  const result = await castVote(token, await actor(), body.itemId, body.name)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
