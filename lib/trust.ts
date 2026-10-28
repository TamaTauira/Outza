import { prisma } from '@/lib/db'
import { sendEmail, OWNER_EMAIL, escapeHtml } from '@/lib/email'

const FREE_MAIL = /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|aol|proton|protonmail|bigpond|optusnet|tpg|iinet|internode)\./
/** Hosts that sell or list other people's events; an email at these domains does not prove you run the event. */
const LISTING_HOSTS = /(ticketmaster|ticketek|eventbrite|humanitix|moshtix|oztix|trybooking|stickytickets|cityofsydney|facebook|instagram|linktr)\./

function registrable(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, '').split('.')
  const n = /^(com|org|net|gov|edu|asn|id)$/.test(parts[parts.length - 2] ?? '') && parts[parts.length - 1]?.length === 2 ? 3 : 2
  return parts.slice(-n).join('.')
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
    prisma.eventClaim.updateMany({ where: { eventId: c.eventId, status: 'PENDING', id: { not: c.id } }, data: { status: 'REJECTED', reviewedAt: new Date(), reviewNote: 'Another organiser was verified for this listing' } }),
  ])
  return c
}

export async function notifyTrustTeam(subject: string, rows: [string, string | null | undefined][]) {
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <h2 style="color:#e8553f;">${escapeHtml(subject)}</h2>
    <div style="background:#f6f6f6;padding:16px;border-radius:8px;">
      ${rows.filter(([, v]) => v).map(([k, v]) => `<p style="white-space:pre-wrap;"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</p>`).join('')}
    </div>
    <p style="color:#666;font-size:12px;">Review it in Admin → Trust & listings (/admin/trust).</p>
  </div>`
  const sent = await sendEmail({ notificationId: process.env.NOTIF_ID_LISTING_REPORT_OR_CLAIM, to: OWNER_EMAIL, subject, html })
  if (!sent.ok) console.error('Trust notification failed:', sent.error)
}
