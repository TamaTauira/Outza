import { prisma } from '@/lib/prisma'
import { isResendTestSender } from '@/lib/email'
import { sendTemplate } from '@/lib/customer-mail'
import { LEGAL_DOCS, type LegalDocId } from '@/lib/legal-docs'
import { siteUrl } from '@/lib/site-url'
import { isQaAccountEmail } from '@/lib/qa-account'

const DOCS: LegalDocId[] = ['terms', 'privacy']

export const PRIVACY_CHANGE_NOTES = [
  'The policy explains more clearly what we collect and why.',
  'It applies to your account when you accept the new version.',
]

/** First sight of a version anchors it and does not email. A later version sends once. */
export function legalNoticeAction(markerVersion: string | null, current: string): 'anchor' | 'send' | 'skip' {
  if (!markerVersion) return 'anchor'
  if (markerVersion === current) return 'skip'
  return 'send'
}

/**
 * When the terms or privacy version changes, tell account holders once.
 * The version already on the site is anchored, so this deploy does not mail anyone.
 * The shared Resend test sender cannot reach customers, so that transport does not send.
 */
export async function runLegalNotices() {
  const results: { doc: string; action: string; sent?: number }[] = []
  for (const doc of DOCS) {
    const version = LEGAL_DOCS[doc].version
    const key = `legal-notice:${doc}`
    const marker = await prisma.ownerAlert.findUnique({ where: { key } })
    const action = legalNoticeAction(marker?.detail ?? null, version)
    if (action === 'anchor') {
      await prisma.ownerAlert.create({
        data: { key, kind: 'LEGAL_NOTICE', title: `${doc} ${version}`, detail: version, lastEmailedAt: new Date() },
      })
      results.push({ doc, action })
      continue
    }
    if (action === 'skip') {
      results.push({ doc, action })
      continue
    }
    if (isResendTestSender()) {
      results.push({ doc, action: 'held' })
      continue
    }
    const users = await prisma.user.findMany({ select: { id: true, email: true }, take: 500 })
    let sent = 0
    const href = `${siteUrl()}${LEGAL_DOCS[doc].path}`
    for (const user of users) {
      if (isQaAccountEmail(user.email)) continue
      const result = doc === 'terms'
        ? await sendTemplate('L1', user.email, { href }, user.id)
        : await sendTemplate('L2', user.email, { href, bullets: PRIVACY_CHANGE_NOTES }, user.id)
      if (result.ok) sent += 1
    }
    if (sent > 0) {
      await prisma.ownerAlert.update({
        where: { key },
        data: { detail: version, title: `${doc} ${version}`, lastEmailedAt: new Date(), lastSeen: new Date() },
      })
    }
    results.push({ doc, action: 'send', sent })
  }
  return results
}
