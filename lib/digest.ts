import { prisma } from '@/lib/db'
import { emailSendingEnabled, redactEmails } from '@/lib/email'
import { recordMailDelivery } from '@/lib/mail-log'
import { sendNewsletter } from '@/lib/newsletter'

const INTERVAL_MS: Record<string, number> = { daily: 22 * 3600e3, weekly: 6.5 * 86400e3, monthly: 29 * 86400e3 }

/**
 * Sends the subscriber their newsletter. `test` sends a copy to themselves without moving their schedule
 * or marking events as already featured.
 */
export async function sendDigest(userId: string, opts: { test?: boolean } = {}) {
  return sendNewsletter(userId, { mode: opts.test ? 'test' : 'send' })
}

/**
 * Sends newsletters to every opted-in user whose frequency interval has elapsed.
 * Due-ness is elapsed time from lastDigestAt (daily / weekly / monthly), not a local clock.
 * Hobby cron runs once a day, so this is the schedule that fits the plan.
 */
export async function runDueDigests() {
  if (!emailSendingEnabled()) {
    console.error('[digest] skipped: email sending is turned off')
    await recordMailDelivery({ kind: 'newsletter-run', status: 'disabled', error: 'Email sending is turned off' })
    return { checked: 0, sent: 0, skipped: 0, blocked: 0, failed: 0, disabled: true }
  }
  const now = Date.now()
  const users = await prisma.user.findMany({
    where: { emailOptIn: true },
    select: { id: true, emailFrequency: true, lastDigestAt: true },
  })
  let sent = 0, skipped = 0, blocked = 0, failed = 0
  for (const u of users) {
    const interval = INTERVAL_MS[u.emailFrequency] ?? INTERVAL_MS.weekly
    if (u.lastDigestAt && now - u.lastDigestAt.getTime() < interval) { skipped++; continue }
    try {
      const r = await sendDigest(u.id)
      if (r.ok) sent++
      else if ('skipped' in r && r.skipped) skipped++
      else {
        const blockedSend = 'blocked' in r && r.blocked
        const restricted = 'restricted' in r && r.restricted
        if (blockedSend) blocked++
        else failed++
        const safe = redactEmails('error' in r ? r.error : 'send failed')
        console.error(`[digest] ${u.id} ${blockedSend ? 'blocked' : restricted ? 'restricted' : 'failed'}: ${safe}`)
      }
    } catch (e: unknown) {
      failed++
      const safe = redactEmails(e instanceof Error ? e.message : 'send failed')
      console.error(`[digest] ${u.id}: ${safe}`)
      await recordMailDelivery({ kind: 'newsletter', userId: u.id, status: 'failed', error: safe })
    }
  }
  const summary = { checked: users.length, sent, skipped, blocked, failed }
  console.log('[digest] done', summary)
  await recordMailDelivery({
    kind: 'newsletter-run',
    status: failed || blocked ? 'failed' : 'ok',
    error: `checked=${summary.checked} sent=${sent} skipped=${skipped} blocked=${blocked} failed=${failed}`,
  })
  return summary
}
