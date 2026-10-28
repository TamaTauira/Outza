import { prisma } from '@/lib/db'
import { LIMITS, MAX_ADS_PER_EVENT, isLocalAdKind } from '@/lib/local-ads-shared'

export * from '@/lib/local-ads-shared'
const BOOKABLE = ['SCHEDULED', 'RESCHEDULED']

/** Ads run until the end of the event's final day (plus a day of grace for late finishes). */
export const adEndsAt = (ev: { date: Date; endDate: Date | null }) => new Date((ev.endDate ?? ev.date).getTime() + 24 * 3600e3)

export const activeAdWhere = (eventId: string) => ({ eventId, status: 'ACTIVE', endsAt: { gt: new Date() } })

export function normaliseUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let s = raw.trim()
  if (!s) return null
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  try {
    const u = new URL(s)
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) return null
    return u.toString().slice(0, LIMITS.url)
  } catch { return null }
}

/** Checks a purchase request. Returns an error message, or the cleaned fields plus the event. */
export async function validateLocalAd(body: any, promoterId: string) {
  const kind = body?.kind
  const businessName = typeof body?.businessName === 'string' ? body.businessName.trim().replace(/\s+/g, ' ') : ''
  const blurb = typeof body?.blurb === 'string' ? body.blurb.trim().replace(/\s+/g, ' ') : ''
  const address = typeof body?.address === 'string' ? body.address.trim().slice(0, LIMITS.address) : ''
  const url = normaliseUrl(body?.url)
  if (!isLocalAdKind(kind)) return { error: 'Choose what kind of business you are promoting' }
  if (businessName.length < 2 || businessName.length > LIMITS.businessName) return { error: `Business name must be 2–${LIMITS.businessName} characters` }
  if (blurb.length < 10 || blurb.length > LIMITS.blurb) return { error: `Description must be 10–${LIMITS.blurb} characters` }
  if (!url) return { error: 'Enter a valid website or booking link' }
  const event = typeof body?.eventId === 'string'
    ? await prisma.event.findUnique({ where: { id: body.eventId }, select: { id: true, title: true, date: true, endDate: true, status: true, duplicateOfId: true } })
    : null
  if (!event || event.duplicateOfId) return { error: 'Event not found', status: 404 }
  const endsAt = adEndsAt(event)
  if (endsAt <= new Date() || !BOOKABLE.includes(event.status)) return { error: 'This event has finished or isn’t going ahead, so it can’t take recommendations', status: 409 }
  const [count, mine] = await Promise.all([
    prisma.localAd.count({ where: activeAdWhere(event.id) }),
    prisma.localAd.count({ where: { ...activeAdWhere(event.id), promoterId } }),
  ])
  if (mine) return { error: 'You already have a recommendation running on this event', status: 409 }
  if (count >= MAX_ADS_PER_EVENT) return { error: 'All recommendation spots for this event are taken', status: 409 }
  return { data: { kind, businessName, blurb, address: address || null, url }, event, endsAt }
}

/** Marks a paid ad live. Idempotent. */
export async function activateLocalAd(id: string) {
  const ad = await prisma.localAd.findUnique({ where: { id }, include: { event: { select: { date: true, endDate: true } } } })
  if (!ad || ad.status === 'ACTIVE') return false
  await prisma.localAd.update({ where: { id }, data: { status: 'ACTIVE', startsAt: new Date(), endsAt: adEndsAt(ad.event) } })
  return true
}
