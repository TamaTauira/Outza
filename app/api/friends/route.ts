import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'

export const dynamic = 'force-dynamic'

const who = { id: true, name: true, email: true } as const

export async function GET() {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const rows = await prisma.friendship.findMany({
    where: { OR: [{ requesterId: me.id }, { addresseeId: me.id }] },
    include: { requester: { select: who }, addressee: { select: who } },
    orderBy: { createdAt: 'desc' },
  })
  const friends = [] as { friendshipId: string; id: string; name: string | null; email: string }[]
  const incoming = [] as typeof friends
  const outgoing = [] as typeof friends
  for (const r of rows) {
    const other = r.requesterId === me.id ? r.addressee : r.requester
    const item = { friendshipId: r.id, ...other }
    if (r.status === 'ACCEPTED') friends.push(item)
    else if (r.addresseeId === me.id) incoming.push(item)
    else outgoing.push(item)
  }
  return NextResponse.json({ friends, incoming, outgoing })
}

/** body: { email } sends a friend request */
export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const { email } = await req.json().catch(() => ({}))
  const target = typeof email === 'string' ? await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true } }) : null
  if (!target) return NextResponse.json({ error: 'No member found with that email. Ask them to sign up first!' }, { status: 404 })
  if (target.id === me.id) return NextResponse.json({ error: "That's you!" }, { status: 400 })
  const reverse = await prisma.friendship.findUnique({ where: { requesterId_addresseeId: { requesterId: target.id, addresseeId: me.id } } })
  if (reverse) {
    // They already asked you — accept it
    await prisma.friendship.update({ where: { id: reverse.id }, data: { status: 'ACCEPTED' } })
    return NextResponse.json({ ok: true, status: 'ACCEPTED' })
  }
  await prisma.friendship.upsert({
    where: { requesterId_addresseeId: { requesterId: me.id, addresseeId: target.id } },
    create: { requesterId: me.id, addresseeId: target.id },
    update: {},
  })
  return NextResponse.json({ ok: true, status: 'PENDING' })
}

/** body: { friendshipId, action: 'accept' | 'decline' | 'remove' } */
export async function PATCH(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const { friendshipId, action } = await req.json().catch(() => ({}))
  const f = typeof friendshipId === 'string' ? await prisma.friendship.findUnique({ where: { id: friendshipId } }) : null
  if (!f || (f.requesterId !== me.id && f.addresseeId !== me.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (action === 'accept' && f.addresseeId === me.id) {
    await prisma.friendship.update({ where: { id: f.id }, data: { status: 'ACCEPTED' } })
  } else if (action === 'decline' || action === 'remove') {
    await prisma.friendship.deleteMany({ where: { id: f.id } })
  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
