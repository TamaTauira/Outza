import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSessionUser, unauthorized } from '@/lib/session'
import { prisma } from '@/lib/db'
import { submitClaim } from '@/lib/claims'
import { recordLandingFromCookieJar } from '@/lib/landing-stats'

export const dynamic = 'force-dynamic'

/** The signed-in user's claim on this listing, if any. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ claim: null })
  const { id } = await params
  const claim = await prisma.eventClaim.findUnique({ where: { eventId_userId: { eventId: id, userId: me.id } }, select: { status: true, createdAt: true, reviewNote: true } })
  return NextResponse.json({ claim })
}

/** body: { orgName, position?, evidenceUrl?, message? } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const r = await submitClaim(me, id, b)
  if (r.status < 400 && r.body.created === true) {
    const jar = await cookies()
    await recordLandingFromCookieJar((name) => jar.get(name)?.value, 'lead')
  }
  return NextResponse.json(r.body, { status: r.status })
}
