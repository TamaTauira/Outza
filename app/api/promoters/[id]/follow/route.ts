import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** body: { follow: boolean } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const { id } = await params
  const { follow } = await req.json().catch(() => ({ follow: true }))
  const promoter = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } })
  if (!promoter || (promoter.role !== 'PROMOTER' && promoter.role !== 'ADMIN')) return NextResponse.json({ error: 'Promoter not found' }, { status: 404 })
  if (promoter.id === me.id) return NextResponse.json({ error: 'You cannot follow yourself' }, { status: 400 })
  if (follow) {
    await prisma.promoterFollow.createMany({ data: [{ followerId: me.id, promoterId: id }], skipDuplicates: true })
  } else {
    await prisma.promoterFollow.deleteMany({ where: { followerId: me.id, promoterId: id } })
  }
  const followers = await prisma.promoterFollow.count({ where: { promoterId: id } })
  return NextResponse.json({ following: !!follow, followers })
}
