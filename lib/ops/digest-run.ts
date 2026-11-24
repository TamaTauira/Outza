import { prisma } from '@/lib/db'
import { sendEmail, emailSendingEnabled, OWNER_EMAIL } from '@/lib/email'
import { digestEmail } from '@/lib/ops/digest-mail'
import { ensureOpsTables } from '@/lib/ops/ensure'
import { digestTokenSecretConfigured, newDigestToken, tokenHash } from '@/lib/ops/tokens'
import { siteUrl } from '@/lib/site-url'

const SHOWN = 30

/** Monday 9:00 am AEDT. Skips the email when nothing is waiting. */
export async function runWeeklyDigest(now = new Date()) {
  await ensureOpsTables()
  const stale = new Date(now.getTime() - 36 * 60 * 60 * 1000)
  await prisma.opsDigestItem.updateMany({
    where: { status: 'QUEUED', createdAt: { lt: stale } },
    data: { status: 'OPEN' },
  })
  const waiting = await prisma.opsDigestItem.count({ where: { status: 'OPEN' } })
  if (!waiting) return { sent: false, reason: 'nothing-to-approve', waiting: 0 }
  if (!emailSendingEnabled()) return { sent: false, reason: 'email off', waiting }
  if (!digestTokenSecretConfigured()) return { sent: false, reason: 'OPS_DIGEST_SECRET or CRON_SECRET is not set', waiting }

  const items = await prisma.opsDigestItem.findMany({
    where: { status: 'OPEN' },
    orderBy: { createdAt: 'asc' },
    take: SHOWN,
  })
  const home = siteUrl()
  const links = []
  for (const item of items) {
    const approve = newDigestToken(item.id, 'approve', now.getTime())
    const decline = newDigestToken(item.id, 'decline', now.getTime())
    await prisma.opsDigestToken.createMany({
      data: [
        { tokenHash: tokenHash(approve.token), itemId: item.id, action: 'approve', expiresAt: new Date(approve.payload.exp) },
        { tokenHash: tokenHash(decline.token), itemId: item.id, action: 'decline', expiresAt: new Date(decline.payload.exp) },
      ],
    })
    links.push({
      summary: item.summary,
      approveUrl: `${home}/api/ops/digest?token=${encodeURIComponent(approve.token)}`,
      declineUrl: `${home}/api/ops/digest?token=${encodeURIComponent(decline.token)}`,
    })
  }
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const handled = await prisma.opsDecision.count({
    where: { createdAt: { gte: weekAgo }, undoneAt: null, actor: { in: ['bot:rules', 'bot:ai'] }, action: { not: 'digest' } },
  })
  const mail = digestEmail({
    items: links,
    handled,
    extra: Math.max(0, waiting - items.length),
    undoUrl: `${home}/admin/ops`,
  })
  const sent = await sendEmail({ to: OWNER_EMAIL, subject: mail.subject, html: mail.html, kind: 'transactional' })
  if (!sent.ok) return { sent: false, reason: sent.error ?? 'send failed', waiting }
  return { sent: true, waiting, shown: items.length, handled }
}
