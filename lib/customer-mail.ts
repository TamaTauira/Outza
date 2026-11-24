import { sendEmail } from '@/lib/email'
import { catalogueEntry, renderTemplate, type MailData, type TemplateId } from '@/lib/email-catalogue'
import { recordMailDelivery } from '@/lib/mail-log'
import { isQaAccountEmail } from '@/lib/qa-account'
import { siteUrl } from '@/lib/site-url'

export async function sendTemplate(id: TemplateId, to: string, data?: MailData, userId?: string | null) {
  const email = to.trim().toLowerCase()
  if (!email || isQaAccountEmail(email)) return { ok: false as const, skipped: true as const }
  const row = catalogueEntry(id)
  const mail = renderTemplate(id, { ...data, email: data?.email || email })
  const result = await sendEmail({
    to: email,
    subject: mail.subject.slice(0, 120),
    html: mail.html,
    text: mail.text,
    kind: row?.kind ?? 'transactional',
    ...(row && row.kind !== 'transactional' ? { unsubscribeUrl: `${siteUrl()}/unsubscribe` } : {}),
  })
  await recordMailDelivery({
    kind: `template-${id}`,
    userId,
    status: result.ok ? 'sent' : result.disabled ? 'disabled' : 'failed',
    error: result.ok ? null : result.error,
  })
  return result
}

export function sendPasswordChanged(email: string) {
  return sendTemplate('A4', email, { href: `${siteUrl()}/forgot-password` })
}

export function sendAccountClosed(email: string) {
  return sendTemplate('A7', email, { email, href: siteUrl() })
}

export function sendWelcome(email: string, name?: string | null) {
  const trimmed = name?.trim()
  return sendTemplate('C1', email, { name: trimmed || 'there', href: siteUrl() })
}

export function sendListingLive(email: string, event: string, href: string) {
  return sendTemplate('P3', email, { event, href })
}

export function sendListingRejected(email: string, event: string, reason: string, href?: string | null) {
  return sendTemplate('P4', email, { event, reason: reason.trim() || 'it needs a change before it can go up', href: href || `${siteUrl()}/local` })
}

export function sendEventClaimApproved(email: string, event: string) {
  return sendTemplate('P7', email, { event, href: `${siteUrl()}/promoter` })
}

export function sendEventClaimRejected(email: string, event: string, reason: string) {
  return sendTemplate('P8', email, { event, reason: reason.trim() || 'we couldn’t match it to the organiser', href: `${siteUrl()}/promoter` })
}

export function sendVenueClaimApproved(email: string, venue: string, href: string) {
  return sendTemplate('P10', email, { venue, href })
}

export function sendVenueClaimRejected(email: string, venue: string, reason: string) {
  return sendTemplate('P11', email, { venue, reason: reason.trim() || 'we couldn’t confirm you manage this venue', href: `${siteUrl()}/venue` })
}
