import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** Owner (or admin) takes their listing down early. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const l = await prisma.localListing.findUnique({ where: { id }, select: { userId: true } })
  if (!l || (l.userId !== me.id && me.role !== 'ADMIN')) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  await prisma.localListing.update({ where: { id }, data: { status: 'REMOVED' } })
  return NextResponse.json({ ok: true })
}

/** Anyone can report a listing. Three reports send it back to moderation. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const reason = String(b.reason ?? '').trim().slice(0, 300)
  const l = await prisma.localListing.findUnique({ where: { id }, select: { reportCount: true, status: true, flags: true, reviewNote: true } })
  if (!l || l.status !== 'APPROVED') return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  const count = l.reportCount + 1
  await prisma.localListing.update({
    where: { id },
    data: {
      reportCount: count,
      reviewNote: [l.reviewNote, reason ? `Report: ${reason}` : null].filter(Boolean).join(' · ').slice(0, 1000),
      ...(count >= 3 ? { status: 'PENDING', flags: [...new Set([...l.flags, 'REPORTED'])] } : {}),
    },
  })
  return NextResponse.json({ ok: true })
}
