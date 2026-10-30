import { NextResponse } from 'next/server'
import { getSessionUser, unauthorized } from '@/lib/session'
import { ownershipUiEnabled } from '@/lib/ownership'
import { acknowledgeDirectEdit, readManagePayload, restoreOverride, saveOverrides } from '@/lib/event-overrides'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  if (!ownershipUiEnabled()) return NextResponse.json({ error: 'These tools are turned off.' }, { status: 404 })
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const { id } = await params
  const payload = await readManagePayload(me.id, id, me.role === 'ADMIN')
  if (!payload) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (payload.forbidden) return NextResponse.json({ error: 'You don’t manage this event.' }, { status: 403 })
  return NextResponse.json(payload)
}

export async function POST(req: Request, { params }: Ctx) {
  if (!ownershipUiEnabled()) return NextResponse.json({ error: 'These tools are turned off.' }, { status: 404 })
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  if (body?.ack === true) {
    const result = await acknowledgeDirectEdit(me.id, id, me.role === 'ADMIN')
    if ('error' in result && result.status !== 200) return NextResponse.json(result, { status: result.status })
    return NextResponse.json(result)
  }
  if (typeof body?.restore === 'string') {
    const result = await restoreOverride(me.id, id, body.restore, me.role === 'ADMIN')
    if ('error' in result && result.status !== 200) return NextResponse.json(result, { status: result.status })
    return NextResponse.json(result)
  }
  const result = await saveOverrides(me.id, id, { fields: body?.fields, confirmed: body?.confirmed === true }, me.role === 'ADMIN')
  if ('error' in result && result.status !== 200) return NextResponse.json(result, { status: result.status })
  return NextResponse.json(result)
}
