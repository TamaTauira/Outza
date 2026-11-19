import { prisma } from '@/lib/db'
import { sendEmail, emailSendingEnabled, escapeHtml, siteUrl, DEFAULT_FROM_EMAIL, activeMailTransport } from '@/lib/email'
import { EMAIL_C, emailBodyCell, emailDocument } from '@/lib/email-brand'
import { sign } from '@/lib/newsletter/links'
import { isQaAccountEmail } from '@/lib/qa-account'
import { loadVenueActivity } from '@/lib/venue-activity-load'
import { venueFollowerCount } from '@/lib/venue-access'

export function venueReportUnsubscribeUrl(userId: string) {
  const q = new URLSearchParams({ u: userId, k: sign(userId, 'venue-report-unsub') })
  return `${siteUrl()}/unsubscribe/venue?${q}`
}

export type VenueMonthStat = {
  name: string
  followers: number
  views: number | null
  saves: number | null
  itineraryAdds: number | null
  ticketClicks: number | null
}

const cell = (value: number | null) => (value == null ? 'Not loaded' : value.toLocaleString('en-AU'))

/** Plain monthly note. Figures are passed in. Nothing is estimated. */
export function venueMonthlyLetter(input: { greeting: string; venues: VenueMonthStat[]; unsubUrl: string }) {
  const rows = input.venues.map((venue) => `<tr>
    <td style="padding:8px 6px;font-weight:600">${escapeHtml(venue.name)}</td>
    <td style="padding:8px 6px;text-align:right">${cell(venue.views)}</td>
    <td style="padding:8px 6px;text-align:right">${cell(venue.saves)}</td>
    <td style="padding:8px 6px;text-align:right">${cell(venue.itineraryAdds)}</td>
    <td style="padding:8px 6px;text-align:right">${cell(venue.ticketClicks)}</td>
    <td style="padding:8px 6px;text-align:right">${venue.followers.toLocaleString('en-AU')}</td>
  </tr>`).join('')
  const text = [
    `Hi ${input.greeting},`,
    'Here is the last 30 days for your venue.',
    ...input.venues.map((venue) => `${venue.name}: views ${cell(venue.views)}, saves ${cell(venue.saves)}, itinerary adds ${cell(venue.itineraryAdds)}, ticket clicks ${cell(venue.ticketClicks)}, followers ${venue.followers}.`),
    'Views and clicks are not attendance. Home areas are not in this note.',
    `Turn this note off: ${input.unsubUrl}`,
    'That does not change your newsletter.',
  ].join('\n')
  const html = emailDocument({
    title: 'Your venue month',
    preheader: 'Views, saves, itinerary adds and ticket clicks for your venue.',
    manageHref: `${siteUrl()}/venue`,
    homeHref: siteUrl(),
    reason: 'You manage a venue. This monthly note can be turned off without changing your newsletter.',
    rows: emailBodyCell(`<h1 style="font-size:20px;margin:0 0 8px">Your venue month</h1>
      <p style="font-size:14px;margin:0 0 12px">Hi ${escapeHtml(input.greeting)}, here is the last 30 days. A blank count means it didn’t load. We don’t fill one in.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr class="mu" style="color:${EMAIL_C.muted};text-align:left"><th style="padding:6px">Venue</th><th style="padding:6px;text-align:right">Views</th><th style="padding:6px;text-align:right">Saves</th><th style="padding:6px;text-align:right">Itinerary</th><th style="padding:6px;text-align:right">Ticket clicks</th><th style="padding:6px;text-align:right">Followers</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="mu" style="font-size:12px;color:${EMAIL_C.muted}">Views and clicks are not attendance.</p>
      <p style="font-size:12px"><a href="${escapeHtml(input.unsubUrl)}">Turn off this monthly note</a>. Your newsletter choice stays as it is.</p>`),
  })
  return { subject: 'Your venue month', html, text }
}

export async function sendVenueMonthly(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, venueMonthlyOptOut: true },
  })
  if (!user?.email) return { ok: false as const, error: 'No email' }
  if (user.venueMonthlyOptOut) return { ok: false as const, skipped: true as const }
  if (isQaAccountEmail(user.email)) return { ok: false as const, skipped: true as const }
  if (activeMailTransport() !== 'smtp') {
    const from = process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL
    if (/onboarding@resend\.dev/i.test(from)) return { ok: false as const, error: 'testing emails only' }
  }
  const grants = await prisma.venueManagementGrant.findMany({
    where: {
      status: 'APPROVED',
      revokedAt: null,
      organisation: { memberships: { some: { userId, status: 'ACTIVE', revokedAt: null, role: 'ADMINISTRATOR' } } },
    },
    select: { venue: { select: { id: true, name: true } } },
    take: 5,
  })
  if (!grants.length) return { ok: false as const, skipped: true as const }
  const start = new Date(Date.now() - 30 * 86400000)
  const startKey = start.toISOString().slice(0, 10)
  const endKey = new Date().toISOString().slice(0, 10)
  const venues: VenueMonthStat[] = []
  for (const grant of grants) {
    const [activity, followers] = await Promise.all([
      loadVenueActivity(grant.venue.id, start, startKey, endKey),
      venueFollowerCount(grant.venue.id).catch(() => 0),
    ])
    venues.push({
      name: grant.venue.name,
      followers: followers ?? 0,
      views: activity?.views ?? null,
      saves: activity?.saves ?? null,
      itineraryAdds: activity?.itineraryAdds ?? null,
      ticketClicks: activity?.ticketClicks ?? null,
    })
  }
  const letter = venueMonthlyLetter({ greeting: user.name?.trim() || 'there', venues, unsubUrl: venueReportUnsubscribeUrl(userId) })
  const sent = await sendEmail({
    to: user.email,
    subject: letter.subject,
    html: letter.html,
    text: letter.text,
    kind: 'report',
    unsubscribeUrl: venueReportUnsubscribeUrl(userId),
  })
  if (!sent.ok) return { ok: false as const, error: sent.error ?? 'Email failed' }
  await prisma.user.update({ where: { id: userId }, data: { lastVenueReportAt: new Date() } })
  return { ok: true as const, venues: venues.length }
}

/** Monthly owner notes. One pass, capped, outside the hourly refresh minute. */
export async function runVenueMonthlyReports() {
  if (!emailSendingEnabled()) return { candidates: 0, sent: 0, skipped: 0 }
  const cutoff = new Date(Date.now() - 27 * 86400000)
  const owners = await prisma.user.findMany({
    where: {
      venueMonthlyOptOut: false,
      OR: [{ lastVenueReportAt: null }, { lastVenueReportAt: { lt: cutoff } }],
      memberships: { some: { status: 'ACTIVE', revokedAt: null, role: 'ADMINISTRATOR', organisation: { venueGrants: { some: { status: 'APPROVED', revokedAt: null } } } } },
      NOT: { AND: [{ email: { startsWith: 'outza-tester+qa-' } }, { email: { endsWith: '@mail.grokbot.com' } }] },
    },
    select: { id: true },
    take: 40,
  })
  let sent = 0
  let skipped = 0
  for (const owner of owners) {
    const result = await sendVenueMonthly(owner.id).catch(() => ({ ok: false as const }))
    if (result.ok) sent += 1
    else skipped += 1
  }
  return { candidates: owners.length, sent, skipped }
}
