import { prisma } from '@/lib/db'
import { emailSendingEnabled } from '@/lib/email'
import { sendNewsletter } from '@/lib/newsletter'

const INTERVAL_MS: Record<string, number> = { daily: 22 * 3600e3, weekly: 6.5 * 86400e3, monthly: 29 * 86400e3 }

/**
 * Sends the subscriber their newsletter. `test` sends a copy to themselves without moving their schedule
 * or marking events as already featured.
 */
export async function sendDigest(userId: string, opts: { test?: boolean } = {}) {
  return sendNewsletter(userId, { mode: opts.test ? 'test' : 'send' })
}

/** Sends newsletters to every opted-in user whose frequency interval has elapsed (unchanged schedule logic). */
export async function runDueDigests() {
  if (!emailSendingEnabled()) return { checked: 0, sent: 0, skipped: 0, blocked: 0 }
  const now = Date.now()
  const users = await prisma.user.findMany({ where: { emailOptIn: true }, select: { id: true, emailFrequency: true, lastDigestAt: true } })
  let sent = 0, skipped = 0, blocked = 0
  for (const u of users) {
    const interval = INTERVAL_MS[u.emailFrequency] ?? INTERVAL_MS.weekly
    if (u.lastDigestAt && now - u.lastDigestAt.getTime() < interval) continue
    try {
      const r = await sendDigest(u.id)
      if (r.ok) sent++
      else if ('skipped' in r && r.skipped) skipped++
      else { if ('blocked' in r && r.blocked) blocked++; console.error(`[digest] ${u.id}: ${r.error}`) }
    } catch (e: any) {
      console.error(`[digest] ${u.id}: ${e?.message}`)
    }
  }
  return { checked: users.length, sent, skipped, blocked }
}
