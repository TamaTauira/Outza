import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized, forbidden, isPromoter } from '@/lib/session'
import { normaliseUrl } from '@/lib/local-ads'
import { LIMITS } from '@/lib/local-ads-shared'

export const dynamic = 'force-dynamic'

async function owned(id: string, userId: string) {
  const ad = await prisma.localAd.findUnique({ where: { id }, select: { id: true, promoterId: true, status: true } })
  if (!ad) return { error: NextResponse.json({ error: 'Ad not found' }, { status: 404 }) }
  if (ad.promoterId !== userId) return { error: forbidden() }
  return { ad }
}

/** Edit the copy or link on your own recommendation. The price and event stay as purchased. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const { id } = await params
  const found = await owned(id, me.id)
  if ('error' in found && found.error) return found.error
  const b = await req.json().catch(() => ({}))
  const data: { businessName?: string; blurb?: string; url?: string; address?: string | null } = {}
  if (typeof b.businessName === 'string') {
    const name = b.businessName.trim().replace(/\s+/g, ' ')
    if (name.length < 2 || name.length > LIMITS.businessName) return NextResponse.json({ error: `Business name must be 2–${LIMITS.businessName} characters` }, { status: 400 })
    data.businessName = name
  }
  if (typeof b.blurb === 'string') {
    const blurb = b.blurb.trim().replace(/\s+/g, ' ')
    if (blurb.length < 10 || blurb.length > LIMITS.blurb) return NextResponse.json({ error: `Description must be 10–${LIMITS.blurb} characters` }, { status: 400 })
    data.blurb = blurb
  }
  if (typeof b.url === 'string') {
    const url = normaliseUrl(b.url)
    if (!url) return NextResponse.json({ error: 'Enter a valid website or booking link' }, { status: 400 })
    data.url = url
  }
  if (typeof b.address === 'string') data.address = b.address.trim().slice(0, LIMITS.address) || null
  if (!Object.keys(data).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  await prisma.localAd.update({ where: { id }, data })
  return NextResponse.json({ ok: true })
}

/** Stop a live recommendation. This does not refund the purchase. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const { id } = await params
  const found = await owned(id, me.id)
  if ('error' in found && found.error) return found.error
  await prisma.localAd.update({ where: { id }, data: { status: 'CANCELLED', endsAt: new Date() } })
  return NextResponse.json({ ok: true, refunded: false })
}
