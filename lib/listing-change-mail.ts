import { prisma } from '@/lib/db'
import { sendTemplate } from '@/lib/customer-mail'
import { isQaAccountEmail } from '@/lib/qa-account'
import { eventPath } from '@/lib/seo'
import { siteUrl } from '@/lib/site-url'

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function emailDay(d: Date): string {
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MO[d.getUTCMonth()]}`
}

export function emailClock(t: string | null | undefined): string {
  const match = t?.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return 'the listed time'
  const hour = Number(match[1])
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${match[2]} ${hour < 12 ? 'am' : 'pm'}`
}

export function uniqueRecipients(people: { userId: string; email: string; name: string | null }[]) {
  const seen = new Set<string>()
  const out: { userId: string; email: string; name: string | null }[] = []
  for (const person of people) {
    const email = person.email.trim().toLowerCase()
    if (!email || isQaAccountEmail(email)) continue
    if (seen.has(person.userId) || seen.has(email)) continue
    seen.add(person.userId)
    seen.add(email)
    out.push({ ...person, email })
  }
  return out
}

async function loadRecipients(eventId: string) {
  const [saves, signals, items] = await Promise.all([
    prisma.savedEvent.findMany({ where: { eventId }, select: { userId: true, user: { select: { email: true, name: true } } } }),
    prisma.eventSignal.findMany({ where: { eventId, kind: 'ITINERARY' }, select: { userId: true, user: { select: { email: true, name: true } } } }),
    prisma.togetherItem.findMany({ where: { eventId, addedById: { not: null } }, select: { addedById: true } }),
  ])
  const rows = [
    ...saves.map((row) => ({ userId: row.userId, email: row.user.email, name: row.user.name })),
    ...signals.map((row) => ({ userId: row.userId, email: row.user.email, name: row.user.name })),
  ]
  const have = new Set(rows.map((row) => row.userId))
  const extra = [...new Set(items.map((row) => row.addedById).filter((id): id is string => !!id && !have.has(id)))]
  if (extra.length) {
    const users = await prisma.user.findMany({ where: { id: { in: extra } }, select: { id: true, email: true, name: true } })
    rows.push(...users.map((user) => ({ userId: user.id, email: user.email, name: user.name })))
  }
  return uniqueRecipients(rows)
}

/**
 * Service mail when a saved or Itinerary event is cancelled, postponed or rescheduled.
 * Savers and Itinerary adders are combined so each person gets one email.
 */
export async function notifyEventStatusChange(
  eventId: string,
  previousStatus: string,
  nextStatus: string,
  previous?: { date?: Date | null; time?: string | null },
) {
  if (!nextStatus || previousStatus === nextStatus) return { sent: 0 }
  if (nextStatus !== 'CANCELLED' && nextStatus !== 'POSTPONED' && nextStatus !== 'RESCHEDULED') return { sent: 0 }
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, date: true, time: true, venueName: true },
  })
  if (!event) return { sent: 0 }
  const people = await loadRecipients(eventId)
  const oldDate = previous?.date ?? event.date
  const oldTime = previous?.time ?? event.time
  const moved = nextStatus !== 'CANCELLED' && (
    nextStatus === 'RESCHEDULED'
    || (previous?.date != null && previous.date.toISOString().slice(0, 10) !== event.date.toISOString().slice(0, 10))
  )
  const href = `${siteUrl()}${eventPath(event)}`
  let sent = 0
  for (const person of people) {
    try {
      await prisma.watchNotice.create({ data: { userId: person.userId, kind: `LISTING_${nextStatus}`, eventId } })
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') continue
      console.error('[email] listing notice', err instanceof Error ? err.message : err)
      continue
    }
    const result = nextStatus === 'CANCELLED'
      ? await sendTemplate('C6', person.email, {
        event: event.title,
        venue: event.venueName,
        date: emailDay(oldDate),
        time: emailClock(oldTime),
        href,
      }, person.userId)
      : await sendTemplate('C7', person.email, {
        event: event.title,
        venue: event.venueName,
        oldDate: emailDay(oldDate),
        oldTime: emailClock(oldTime),
        newDate: moved ? emailDay(event.date) : undefined,
        newTime: moved ? emailClock(event.time) : undefined,
        href,
      }, person.userId)
    if (!result.ok) {
      await prisma.watchNotice.deleteMany({ where: { userId: person.userId, kind: `LISTING_${nextStatus}`, eventId } }).catch(() => {})
      continue
    }
    sent += 1
  }
  if (nextStatus === 'CANCELLED') {
    await prisma.savedEvent.deleteMany({ where: { eventId } }).catch((err) => {
      console.error('[email] clear saves', err instanceof Error ? err.message : err)
    })
  }
  return { sent }
}
