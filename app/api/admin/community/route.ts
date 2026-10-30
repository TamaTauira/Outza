import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { communityAdminSnapshot, moderateCommunity } from '@/lib/community'

export const dynamic = 'force-dynamic'

async function adminId() {
  const session = await auth()
  const user = session?.user as { id?: string; role?: string } | undefined
  if (!user?.id || user.role !== 'ADMIN') return null
  return user.id
}

export async function GET() {
  const id = await adminId()
  if (!id) return NextResponse.json({ error: 'Admins only' }, { status: 403 })
  const snapshot = await communityAdminSnapshot()
  return NextResponse.json(snapshot)
}

export async function POST(req: Request) {
  const id = await adminId()
  if (!id) return NextResponse.json({ error: 'Admins only' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const action = body?.action
  if (action !== 'approve' && action !== 'reject' && action !== 'remove') {
    return NextResponse.json({ error: 'Choose approve, reject or remove.' }, { status: 400 })
  }
  const result = await moderateCommunity(String(body?.id ?? ''), action, id, typeof body?.note === 'string' ? body.note : null)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
