import { NextResponse } from 'next/server'
import { validToken } from '@/lib/together'
import { actor, addPrivateStop, removePrivateStop, updatePrivateStop } from '@/lib/together-server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!validToken(token)) return NextResponse.json({ error: 'That invite link does not look right' }, { status: 400 })
  const body = await req.json().catch(() => ({}))
  const result = await addPrivateStop(token, await actor(), body)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!validToken(token)) return NextResponse.json({ error: 'That invite link does not look right' }, { status: 400 })
  const body = await req.json().catch(() => ({}))
  if (typeof body.id !== 'string' || !body.id) return NextResponse.json({ error: 'Missing stop' }, { status: 400 })
  const result = await updatePrivateStop(token, await actor(), body.id, body)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!validToken(token)) return NextResponse.json({ error: 'That invite link does not look right' }, { status: 400 })
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ error: 'Missing stop' }, { status: 400 })
  const result = await removePrivateStop(token, await actor(), id)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
