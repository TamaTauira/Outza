import { prisma } from '@/lib/prisma'
import { sendEmail, emailSendingEnabled, escapeHtml, siteUrl, DEFAULT_FROM_EMAIL, activeMailTransport } from '@/lib/email'
import { REFERRAL_LABELS, REFERRAL_SOURCES, type ReferralSource } from '@/lib/referrals'
import { eventPath } from '@/lib/seo'
import { getAudienceInsights, type Share, type TopEvent } from '@/lib/audience-insights'
import { AUDIENCE_DISCLAIMER, MIN_GROUP } from '@/lib/profile-shared'
import { emailLockup } from '@/lib/email-brand'

const n = (v: number) => v.toLocaleString('en-AU')

/** Builds and emails a performance report for one promoter. Figures are all-time counters from our own tracking. */
export async function sendPromoterReport(userId: string): Promise<{ ok: boolean; error?: string; events?: number }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, orgName: true, proUntil: true } })
  if (!user?.email) return { ok: false, error: 'No email address on this account' }
  // Resend's shared onboarding sender can only mail the account that owns the API key.
  // Yahoo SMTP is a real mailbox, so that restriction does not apply while SMTP is the transport.
  if (activeMailTransport() !== 'smtp') {
    const from = process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL
    if (/onboarding@resend\.dev/i.test(from)) {
      return { ok: false, error: 'testing emails only: verify a domain and set RESEND_FROM_EMAIL' }
    }
  }
  const pro = !!user.proUntil && user.proUntil > new Date()
  const since = new Date(Date.now() - 60 * 86400000)
  const events = await prisma.event.findMany({
    where: { promoterId: userId, date: { gte: since } },
    orderBy: { date: 'asc' },
    take: 25,
    select: {
      id: true, title: true, date: true, views: true, ticketClicks: true,
      promotions: { where: { status: { in: ['ACTIVE', 'EXPIRED'] } }, select: { id: true } },
      referrals: { select: { source: true, count: true } },
      _count: { select: { savedBy: true, attendees: true } },
    },
  })
  if (!events.length) return { ok: false, error: 'No recent or upcoming events to report on yet' }

  const base = siteUrl()
  const totals: Record<string, number> = {}
  const rows = events.map((e) => {
    const unlocked = pro || e.promotions.length > 0
    if (unlocked) for (const r of e.referrals) totals[r.source] = (totals[r.source] ?? 0) + r.count
    const ctr = unlocked && e.views ? `${((e.ticketClicks / e.views) * 100).toFixed(1)}%` : '-'
    const cell = (v: string) => `<td style="padding:8px 6px;text-align:right;font-variant-numeric:tabular-nums">${v}</td>`
    return `<tr style="border-top:1px solid #eee"><td style="padding:8px 6px"><a href="${base}${eventPath(e)}" style="color:#111;font-weight:600;text-decoration:none">${escapeHtml(e.title)}</a><br><span style="color:#777;font-size:12px">${e.date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</span></td>${cell(unlocked ? n(e.views) : 'Locked')}${cell(unlocked ? n(e.ticketClicks) : 'Locked')}${cell(ctr)}${cell(`${e._count.savedBy} / ${e._count.attendees}`)}</tr>`
  }).join('')
  const refTotal = Object.values(totals).reduce((s, v) => s + v, 0)
  const refRows = refTotal
    ? REFERRAL_SOURCES.filter((s) => totals[s]).map((s) => `<tr><td style="padding:4px 6px">${REFERRAL_LABELS[s as ReferralSource]}</td><td style="padding:4px 6px;text-align:right">${n(totals[s])} (${Math.round((totals[s] / refTotal) * 100)}%)</td></tr>`).join('')
    : '<tr><td style="padding:4px 6px;color:#777">No tracked visits yet.</td></tr>'

  // Grouped, anonymised audience insights (groups under MIN_GROUP hidden). Never blocks the report if it fails.
  const ins = await getAudienceInsights(userId).catch((e) => { console.error('[promoter-report] insights', e); return null })
  const shareRows = (title: string, list: Share[]) => `<p style="font-size:13px;font-weight:700;margin:12px 0 4px">${title}</p>` + (list.length
    ? `<table style="width:100%;border-collapse:collapse;font-size:13px">${list.map((s) => `<tr><td style="padding:3px 6px">${escapeHtml(s.label)}</td><td style="padding:3px 6px;text-align:right;width:60px">${s.pct}%</td></tr>`).join('')}</table>`
    : `<p style="font-size:12px;color:#777;margin:0">Hidden: fewer than ${MIN_GROUP} people.</p>`)
  const topRows = (title: string, list: TopEvent[], unit: string) => list.length
    ? `<p style="font-size:13px;font-weight:700;margin:12px 0 4px">${title}</p><table style="width:100%;border-collapse:collapse;font-size:13px">${list.map((e) => `<tr><td style="padding:3px 6px"><a href="${base}${eventPath(e)}" style="color:#111;text-decoration:none">${escapeHtml(e.title)}</a></td><td style="padding:3px 6px;text-align:right;width:90px">${n(e.count)} ${unit}</td></tr>`).join('')}</table>`
    : ''
  const audience = !ins ? '' : `<h2 style="font-size:15px;margin:24px 0 6px">Who's into your events</h2>
  ${ins.enough
    ? `<p style="font-size:13px;color:#444;margin:0">About ${n(ins.audienceApprox)}+ interested people.</p>${shareRows('Age bands', ins.ageBands)}${shareRows('Home areas', ins.areas)}${shareRows('Also into', ins.interests)}${shareRows('How far ahead they plan', ins.planAhead)}`
    : `<p style="font-size:13px;color:#444;margin:0">The crowd's still gathering! Age bands, home areas and more appear once ${MIN_GROUP}+ signed-in people engage with your events.</p>`}
  ${topRows('Most saved', ins.topSaved, 'saves')}${topRows('Most shared', ins.topShared, 'shares')}${topRows('Most added to itineraries', ins.topItinerary, 'adds')}
  <p style="font-size:11px;color:#777;margin-top:10px">${escapeHtml(AUDIENCE_DISCLAIMER)}</p>`

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#111">
  ${emailLockup()}
  <div style="height:16px"></div>
  <h1 style="font-size:20px;margin:0 0 6px">Your event performance report</h1>
  <p style="font-size:14px;color:#444;margin:0 0 16px">Hi ${escapeHtml(user.orgName || user.name || 'there')}, here's how your listings are tracking on VibePeep. Figures are totals since each listing went live.</p>
  <table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="color:#777;font-size:12px;text-align:left"><th style="padding:6px">Event</th><th style="padding:6px;text-align:right">Views</th><th style="padding:6px;text-align:right">Ticket clicks</th><th style="padding:6px;text-align:right">CTR</th><th style="padding:6px;text-align:right">Saves / going</th></tr></thead><tbody>${rows}</tbody></table>
  <h2 style="font-size:15px;margin:24px 0 6px">Where visitors came from</h2>
  <table style="width:100%;border-collapse:collapse;font-size:13px">${refRows}</table>
  ${audience}
  ${pro ? '' : '<p style="font-size:12px;color:#777;margin-top:12px">"Locked" figures unlock when an event is promoted, or for every event with Promoter Pro.</p>'}
  <p style="margin:24px 0"><a href="${base}/promoter" style="background:#E24B2A;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px">Open your dashboard</a></p>
  <p style="font-size:11px;color:#999">You're receiving this because you requested a report or turned on weekly reports in your promoter dashboard. You can switch weekly reports off there at any time.</p>
</div>`

  const res = await sendEmail({ to: user.email, subject: 'Your VibePeep event performance report', html })
  if (!res.ok) return { ok: false, error: res.error ?? 'Email failed' }
  await prisma.user.update({ where: { id: userId }, data: { lastReportAt: new Date() } })
  return { ok: true, events: events.length }
}

/** Sends weekly reports to opted-in promoters whose last report is at least 7 days old. */
export async function runWeeklyPromoterReports() {
  if (!emailSendingEnabled()) return { candidates: 0, sent: 0, skipped: 0 }
  const cutoff = new Date(Date.now() - 7 * 86400000 + 3600000)
  const users = await prisma.user.findMany({
    where: { weeklyReport: true, role: { in: ['PROMOTER', 'ADMIN'] }, OR: [{ lastReportAt: null }, { lastReportAt: { lt: cutoff } }] },
    select: { id: true }, take: 200,
  })
  let sent = 0, skipped = 0
  for (const u of users) {
    const r = await sendPromoterReport(u.id).catch(() => ({ ok: false }))
    if (r.ok) sent++; else skipped++
  }
  return { candidates: users.length, sent, skipped }
}
