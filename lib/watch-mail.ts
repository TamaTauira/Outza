import { prisma } from '@/lib/db'
import { emailSendingEnabled, redactEmails, sendEmail, siteUrl } from '@/lib/email'
import { recordMailDelivery } from '@/lib/mail-log'
import { eventPath } from '@/lib/seo'
import { isPastEvent } from '@/lib/seo'
import { composeWatchEmail, inReminderWindow, mailDue, type MailEvent } from '@/lib/watch-shared'

const eventBits = {
  id: true, title: true, date: true, endDate: true, time: true, venueName: true, city: true, category: true, suburb: true,
} as const

function whenLabel(ev: { date: Date; time: string | null; city: string }): string {
  const key = ev.date.toISOString().slice(0, 10)
  const day = new Date(`${key}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  return ev.time ? `${day} ${ev.time}` : day
}

function toMail(ev: { id: string; title: string; date: Date; time: string | null; venueName: string; city: string }): MailEvent {
  return {
    id: ev.id,
    title: ev.title,
    when: whenLabel(ev),
    venue: `${ev.venueName}, ${ev.city}`,
    href: `${siteUrl()}${eventPath(ev)}`,
  }
}

async function savedUpcoming(userId: string) {
  const rows = await prisma.savedEvent.findMany({
    where: { userId },
    orderBy: { event: { date: 'asc' } },
    take: 40,
    select: { event: { select: eventBits } },
  })
  return rows.map((row) => row.event).filter((ev) => !isPastEvent(ev))
}

async function matchingNew(userId: string, savedIds: Set<string>, tags: string[], venues: { venueName: string; city: string | null }[]) {
  if (!tags.length && !venues.length) return []
  const or = [
    ...(tags.length ? [{ category: { in: tags } }] : []),
    ...venues.map((venue) => ({
      venueName: { equals: venue.venueName, mode: 'insensitive' as const },
      ...(venue.city ? { city: venue.city } : {}),
    })),
  ]
  const rows = await prisma.event.findMany({
    where: { duplicateOfId: null, status: 'SCHEDULED', date: { gte: new Date(Date.now() - 86400000) }, OR: or },
    orderBy: { date: 'asc' },
    take: 30,
    select: eventBits,
  })
  return rows.filter((ev) => !savedIds.has(ev.id) && !isPastEvent(ev)).slice(0, 5)
}

export async function sendWatchDigest(userId: string, opts: { test?: boolean } = {}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, emailOptIn: true, emailFrequency: true, lastWatchDigestAt: true, preferredCategories: true,
      venueFollows: { select: { venueName: true, city: true } },
    },
  })
  if (!user) return { ok: false as const, error: 'Account not found' }
  const saved = await savedUpcoming(user.id)
  const hasFollows = user.preferredCategories.length > 0 || user.venueFollows.length > 0
  if (!opts.test && !user.emailOptIn) return { ok: false as const, skipped: true as const, reason: 'opt-out' }
  if (!opts.test && !saved.length && user.venueFollows.length === 0) return { ok: false as const, skipped: true as const, reason: 'nothing-to-follow' }
  if (!opts.test && !mailDue(user.lastWatchDigestAt, user.emailFrequency)) return { ok: false as const, skipped: true as const, reason: 'not-due' }
  const matches = hasFollows ? await matchingNew(user.id, new Set(saved.map((ev) => ev.id)), user.preferredCategories, user.venueFollows) : []
  const savedMail = saved.slice(0, 8).map(toMail)
  const mail = composeWatchEmail({ saved: savedMail, matches: matches.map(toMail) })
  if (!mail) return { ok: false as const, skipped: true as const, reason: 'empty' }
  if (!emailSendingEnabled()) {
    console.error('[watchlist] digest skipped: RESEND_API_KEY is not set')
    await recordMailDelivery({ kind: 'watchlist', userId: user.id, status: 'disabled', error: 'RESEND_API_KEY is not set' })
    return { ok: false as const, disabled: true as const, error: 'Email sending is turned off' }
  }
  const sent = await sendEmail({ to: user.email, subject: opts.test ? `[Preview] ${mail.subject}` : mail.subject, html: mail.html, text: mail.text })
  if (!sent.ok) {
    const status = sent.restricted ? 'restricted' : 'failed'
    const safe = redactEmails(sent.error)
    console.error(`[watchlist] digest user=${user.id} status=${status} ${safe}`)
    await recordMailDelivery({ kind: 'watchlist', userId: user.id, status, error: safe })
    return { ...sent, error: safe }
  }
  await recordMailDelivery({ kind: 'watchlist', userId: user.id, status: opts.test ? 'test' : 'sent' })
  if (!opts.test) await prisma.user.update({ where: { id: user.id }, data: { lastWatchDigestAt: new Date() } })
  return { ok: true as const }
}

export async function sendDueReminders() {
  if (!emailSendingEnabled()) return { checked: 0, sent: 0, skipped: 0, failed: 0 }
  const users = await prisma.user.findMany({
    where: { reminderOptIn: true },
    select: { id: true, email: true },
    take: 200,
  })
  let sent = 0
  let skipped = 0
  let failed = 0
  for (const user of users) {
    const saved = await savedUpcoming(user.id)
    const due = saved.filter((ev) => inReminderWindow(ev.date.toISOString().slice(0, 10), ev.time, ev.city))
    if (!due.length) { skipped++; continue }
    const already = await prisma.watchNotice.findMany({
      where: { userId: user.id, kind: 'REMINDER', eventId: { in: due.map((ev) => ev.id) } },
      select: { eventId: true },
    })
    const seen = new Set(already.map((row) => row.eventId))
    const fresh = due.filter((ev) => !seen.has(ev.id)).slice(0, 6)
    if (!fresh.length) { skipped++; continue }
    const mail = composeWatchEmail({ saved: fresh.map(toMail), matches: [], reminders: true })
    if (!mail) { skipped++; continue }
    const result = await sendEmail({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text })
    if (!result.ok) {
      failed++
      const status = result.restricted ? 'restricted' : 'failed'
      const safe = redactEmails(result.error)
      console.error(`[watchlist] reminder user=${user.id} status=${status} ${safe}`)
      await recordMailDelivery({ kind: 'reminder', userId: user.id, status, error: safe })
      continue
    }
    await prisma.watchNotice.createMany({
      data: fresh.map((ev) => ({ userId: user.id, kind: 'REMINDER', eventId: ev.id })),
      skipDuplicates: true,
    })
    await recordMailDelivery({ kind: 'reminder', userId: user.id, status: 'sent' })
    sent++
  }
  return { checked: users.length, sent, skipped, failed }
}

export async function runWatchMail() {
  if (!emailSendingEnabled()) {
    console.error('[watchlist] skipped: RESEND_API_KEY is not set')
    await recordMailDelivery({ kind: 'watchlist-run', status: 'disabled', error: 'RESEND_API_KEY is not set' })
    return {
      disabled: true,
      digests: { checked: 0, sent: 0, skipped: 0, failed: 0 },
      reminders: { checked: 0, sent: 0, skipped: 0, failed: 0 },
    }
  }
  // Opted-in accounts only. Category follows stay on the newsletter; this mail needs a save or a venue follow.
  // Frequency is elapsed time from lastWatchDigestAt. Reminder windows use the event city's timezone separately.
  const users = await prisma.user.findMany({
    where: { emailOptIn: true },
    select: { id: true, emailFrequency: true, lastWatchDigestAt: true, venueFollows: { select: { userId: true }, take: 1 }, saved: { select: { userId: true }, take: 1 } },
    take: 300,
  })
  let sent = 0
  let skipped = 0
  let failed = 0
  for (const user of users) {
    if (!mailDue(user.lastWatchDigestAt, user.emailFrequency)) { skipped++; continue }
    if (!user.saved.length && !user.venueFollows.length) { skipped++; continue }
    try {
      const result = await sendWatchDigest(user.id)
      if (result.ok) sent++
      else if ('skipped' in result && result.skipped) skipped++
      else failed++
    } catch (err) {
      failed++
      const safe = redactEmails(err instanceof Error ? err.message : 'send failed')
      console.error(`[watchlist] digest user=${user.id} ${safe}`)
      await recordMailDelivery({ kind: 'watchlist', userId: user.id, status: 'failed', error: safe })
    }
  }
  const reminders = await sendDueReminders()
  const summary = { digests: { checked: users.length, sent, skipped, failed }, reminders }
  console.log('[watchlist] done', summary)
  await recordMailDelivery({
    kind: 'watchlist-run',
    status: failed || reminders.failed ? 'failed' : 'ok',
    error: `digests sent=${sent} skipped=${skipped} failed=${failed}; reminders sent=${reminders.sent} skipped=${reminders.skipped} failed=${reminders.failed}`,
  })
  return summary
}
