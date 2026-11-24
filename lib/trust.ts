import { prisma } from '@/lib/db'
import { sendEmail, OWNER_EMAIL, escapeHtml } from '@/lib/email'
import { EMAIL_C, emailBodyCell, emailDocument } from '@/lib/email-brand'
import { siteUrl } from '@/lib/site-url'
import { ensureOrganiserGrant } from '@/lib/event-overrides'

const FREE_MAIL = /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|aol|proton|protonmail|bigpond|optusnet|tpg|iinet|internode)\./
/** Hosts that sell or list other people's events; an email at these domains does not prove you run the event. */
const LISTING_HOSTS = /(ticketmaster|ticketek|eventbrite|humanitix|moshtix|oztix|trybooking|stickytickets|cityofsydney|facebook|instagram|linktr)\./

function registrable(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, '').split('.')
  const n = /^(com|org|net|gov|edu|asn|id)$/.test(parts[parts.length - 2] ?? '') && parts[parts.length - 1]?.length === 2 ? 3 : 2
  return parts.slice(-n).join('.')
}

/** Free inboxes do not prove the sender runs the event. */
export function isFreeMail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  return !!domain && FREE_MAIL.test(domain)
}

/** True when the claimant's work email shares a domain with the event's own organiser/official website. */
export function emailMatchesOrganiser(email: string, urls: (string | null | undefined)[]): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain || FREE_MAIL.test(domain)) return false
  const mine = registrable(domain)
  return urls.some((u) => {
    if (!u) return false
    try {
      const host = new URL(u).hostname
      return !LISTING_HOSTS.test(host) && registrable(host) === mine
    } catch { return false }
  })
}

export async function approveClaim(claimId: string, note?: string) {
  const c = await prisma.eventClaim.findUnique({ where: { id: claimId }, include: { user: { select: { id: true, role: true } } } })
  if (!c) return null
  await prisma.$transaction([
    prisma.eventClaim.update({ where: { id: c.id }, data: { status: 'APPROVED', reviewedAt: new Date(), reviewNote: note ?? null } }),
    prisma.event.update({ where: { id: c.eventId }, data: { promoterId: c.userId } }),
    ...(c.user.role === 'CONSUMER' ? [prisma.user.update({ where: { id: c.userId }, data: { role: 'PROMOTER', orgName: c.orgName } })] : []),
    prisma.eventClaim.updateMany({ where: { eventId: c.eventId, status: 'PENDING', id: { not: c.id } }, data: { status: 'REJECTED', reviewedAt: new Date(), reviewNote: 'Another organiser already manages this listing' } }),
  ])
  const user = await prisma.user.findUnique({ where: { id: c.userId }, select: { email: true } })
  if (user?.email) {
    await ensureOrganiserGrant(c.userId, c.eventId, c.orgName, user.email).catch((err) => {
      console.error('organiser grant failed', err instanceof Error ? err.message : err)
    })
    const event = await prisma.event.findUnique({ where: { id: c.eventId }, select: { title: true } })
    const { sendEventClaimApproved } = await import('@/lib/customer-mail')
    await sendEventClaimApproved(user.email, event?.title || 'your listing').catch((err) => console.error('[email] claim approved', err instanceof Error ? err.message : err))
  }
  return c
}

export async function notifyTrustTeam(subject: string, rows: [string, string | null | undefined][]) {
  const home = siteUrl()
  const html = emailDocument({
    title: subject,
    preheader: subject,
    manageHref: `${home}/admin/trust`,
    banner: 'trust',
    homeHref: home,
    reason: 'Review it in Admin → Trust & listings (/admin/trust).',
    rows: emailBodyCell(`<h2 style="color:${EMAIL_C.accent};margin:0 0 12px;font-size:20px;">${escapeHtml(subject)}</h2>
    <div class="card" style="background:#f6f6f6;padding:16px;border-radius:8px;">
      ${rows.filter(([, v]) => v).map(([k, v]) => `<p style="white-space:pre-wrap;margin:0 0 8px;"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</p>`).join('')}
    </div>`),
  })
  const sent = await sendEmail({ to: OWNER_EMAIL, subject, html, kind: 'transactional' })
  if (!sent.ok) console.error('Trust notification failed:', sent.error)
}
