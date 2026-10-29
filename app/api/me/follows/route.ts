import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { CATEGORIES } from '@/lib/categories'
import { venueKey } from '@/lib/together'

export const dynamic = 'force-dynamic'

const names = new Set(CATEGORIES.map((c) => c.name))

export async function GET() {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const user = await prisma.user.findUnique({
    where: { id: me.id },
    select: {
      preferredCategories: true,
      reminderOptIn: true,
      emailOptIn: true,
      emailFrequency: true,
      venueFollows: { orderBy: { createdAt: 'desc' }, select: { venueKey: true, venueName: true, city: true } },
    },
  })
  if (!user) return unauthorized()
  return NextResponse.json({
    tags: user.preferredCategories,
    venues: user.venueFollows,
    reminderOptIn: user.reminderOptIn,
    emailOptIn: user.emailOptIn,
    emailFrequency: user.emailFrequency,
  })
}

/** { kind: 'tag' | 'venue', value, city?, follow } — tags update preferredCategories so the newsletter stays in step. */
export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const follow = body.follow !== false
  if (body.kind === 'tag') {
    const tag = typeof body.value === 'string' ? body.value.trim() : ''
    if (!names.has(tag)) return NextResponse.json({ error: 'Unknown interest' }, { status: 400 })
    const user = await prisma.user.findUnique({ where: { id: me.id }, select: { preferredCategories: true } })
    const current = new Set(user?.preferredCategories ?? [])
    if (follow) current.add(tag)
    else current.delete(tag)
    await prisma.user.update({ where: { id: me.id }, data: { preferredCategories: [...current] } })
    return NextResponse.json({ ok: true, tags: [...current] })
  }
  if (body.kind === 'venue') {
    const venueName = typeof body.value === 'string' ? body.value.trim().slice(0, 160) : ''
    if (venueName.length < 2) return NextResponse.json({ error: 'Name the venue' }, { status: 400 })
    const city = typeof body.city === 'string' ? body.city.trim().slice(0, 40) : null
    const key = venueKey(venueName, city)
    if (follow) {
      await prisma.venueFollow.upsert({
        where: { userId_venueKey: { userId: me.id, venueKey: key } },
        create: { userId: me.id, venueKey: key, venueName, city },
        update: { venueName, city },
      })
    } else {
      await prisma.venueFollow.deleteMany({ where: { userId: me.id, venueKey: key } })
    }
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Say whether this is a tag or a venue' }, { status: 400 })
}
