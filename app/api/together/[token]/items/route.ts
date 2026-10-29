import { NextResponse } from 'next/server'
import { validToken } from '@/lib/together'
import { actor, addEvents, removeEvent } from '@/lib/together-server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!validToken(token)) return NextResponse.json({ error: 'That invite link does not look right' }, { status: 400 })
  const body = await req.json().catch(() => ({}))
  const ids = Array.isArray(body.eventIds) ? body.eventIds : body.eventId ? [body.eventId] : []
  const clean = ids.filter((id: unknown) => typeof id === 'string')
  if (!clean.length) return NextResponse.json({ error: 'Choose an event to add' }, { status: 400 })
  const result = await addEvents(token, await actor(), clean)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!validToken(token)) return NextResponse.json({ error: 'That invite link does not look right' }, { status: 400 })
  const eventId = new URL(req.url).searchParams.get('eventId') ?? ''
  if (!eventId) return NextResponse.json({ error: 'Missing event' }, { status: 400 })
  const result = await removeEvent(token, eventId)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
