import { prisma } from '@/lib/prisma'
import { sendEmail, emailSendingEnabled, escapeHtml, siteUrl, DEFAULT_FROM_EMAIL, activeMailTransport } from '@/lib/email'
import { REFERRAL_LABELS, REFERRAL_SOURCES, type ReferralSource } from '@/lib/referrals'
import { eventPath, isPastEvent } from '@/lib/seo'
import { isHiddenFromPublic } from '@/lib/community-shared'
import { sign } from '@/lib/newsletter/links'
import { metricDay, peakWeekday, reachTips, recapFragment, shiftDay } from '@/lib/organiser-reach'
import { getAudienceInsights, type Share, type TopEvent } from '@/lib/audience-insights'
import { AUDIENCE_DISCLAIMER, MIN_GROUP } from '@/lib/profile-shared'
import { EMAIL_C, emailBodyCell, emailButton, emailDocument, emailLink } from '@/lib/email-brand'
import { isQaAccountEmail } from '@/lib/qa-account'

const n = (v: number) => v.toLocaleString('en-AU')

export function reportUnsubscribeUrl(userId: string) {
  const q = new URLSearchParams({ u: userId, k: sign(userId, 'report-unsub') })
  return `${siteUrl()}/unsubscribe/report?${q}`
}

/** One-click target. The footer keeps the page link. */
export function reportUnsubscribeApiUrl(userId: string) {
  const q = new URLSearchParams({ u: userId, k: sign(userId, 'report-unsub') })
  return `${siteUrl()}/api/promoter/report/unsubscribe?${q}`
}

/** Link target for a promoter-report event. Hidden, unapproved, removed, and past listings 404, so they are not linked. */
export function publicReportHref(event: {
  id: string
  title?: string | null
  date: Date | string
  endDate?: Date | string | null
  city?: string | null
  hidden?: boolean | null
  moderationStatus?: string | null
  deletedAt?: Date | string | null
  approvalState?: string | null
}, origin: string): string | null {
  if (event.deletedAt) return null
  if (event.approvalState && event.approvalState !== 'APPROVED') return null
  if (isHiddenFromPublic(event)) return null
  if (isPastEvent(event)) return null
  return `${origin}${eventPath(event)}`
}

/** Builds and emails a performance report for one promoter. Figures are all-time counters from our own tracking. */
export async function sendPromoterReport(userId: string): Promise<{ ok: boolean; error?: string; events?: number }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, orgName: true, proUntil: true } })
  if (!user?.email) return { ok: false, error: 'No email address on this account' }
  if (isQaAccountEmail(user.email)) return { ok: false, error: 'QA accounts are not emailed' }
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
      id: true, title: true, date: true, endDate: true, city: true, views: true, ticketClicks: true,
      hidden: true, moderationStatus: true, deletedAt: true, approvalState: true,
      promotions: { where: { status: { in: ['ACTIVE', 'EXPIRED'] } }, select: { id: true } },
      referrals: { select: { source: true, count: true } },
      _count: { select: { savedBy: true, attendees: true } },
    },
  })
  if (!events.length) return { ok: false, error: 'No recent or upcoming events to report on yet' }

  const base = siteUrl()
  const hrefFor = new Map<string, string>()
  for (const event of events) {
    const href = publicReportHref(event, base)
    if (href) hrefFor.set(event.id, href)
  }
  const totals: Record<string, number> = {}
  const titleLink = (id: string, title: string) => {
    const href = hrefFor.get(id)
    return href ? emailLink(href, title) : `<span class="tx" style="color:${EMAIL_C.ink};font-weight:600;">${escapeHtml(title)}</span>`
  }
  const rows = events.map((e) => {
    const unlocked = pro || e.promotions.length > 0
    if (unlocked) for (const r of e.referrals) totals[r.source] = (totals[r.source] ?? 0) + r.count
    const ctr = unlocked && e.views ? `${((e.ticketClicks / e.views) * 100).toFixed(1)}%` : '-'
    const cell = (v: string) => `<td class="tx" style="padding:8px 6px;text-align:right;font-variant-numeric:tabular-nums;color:${EMAIL_C.ink}">${v}</td>`
    return `<tr style="border-top:1px solid #eee"><td style="padding:8px 6px">${titleLink(e.id, e.title)}<br><span class="mu" style="color:${EMAIL_C.muted};font-size:12px">${e.date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</span></td>${cell(unlocked ? n(e.views) : 'Locked')}${cell(unlocked ? n(e.ticketClicks) : 'Locked')}${cell(ctr)}${cell(`${e._count.savedBy} / ${e._count.attendees}`)}</tr>`
  }).join('')
  const refTotal = Object.values(totals).reduce((s, v) => s + v, 0)
  const refRows = REFERRAL_SOURCES.filter((s) => totals[s]).map((s) => `<tr><td class="tx" style="padding:4px 6px;color:${EMAIL_C.ink}">${REFERRAL_LABELS[s as ReferralSource]}</td><td class="tx" style="padding:4px 6px;text-align:right;color:${EMAIL_C.ink}">${n(totals[s])} (${Math.round((totals[s] / refTotal) * 100)}%)</td></tr>`).join('')
  const referralBlock = refTotal
    ? `<h2 class="tx" style="font-size:15px;margin:24px 0 6px;color:${EMAIL_C.ink}">Where visitors came from</h2><table style="width:100%;border-collapse:collapse;font-size:13px">${refRows}</table>`
    : `<p class="mu" style="font-size:13px;margin:24px 0 0;color:${EMAIL_C.muted}">No tracked visits yet.</p>`

  // Grouped, anonymised audience insights (groups under MIN_GROUP hidden). Never blocks the report if it fails.
  const ins = await getAudienceInsights(userId).catch((e) => { console.error('[promoter-report] insights', e); return null })
  const shareRows = (title: string, list: Share[]) => `<p class="tx" style="font-size:13px;font-weight:700;margin:12px 0 4px;color:${EMAIL_C.ink}">${title}</p>` + (list.length
    ? `<table style="width:100%;border-collapse:collapse;font-size:13px">${list.map((s) => `<tr><td class="tx" style="padding:3px 6px;color:${EMAIL_C.ink}">${escapeHtml(s.label)}</td><td class="tx" style="padding:3px 6px;text-align:right;width:60px;color:${EMAIL_C.ink}">${s.pct}%</td></tr>`).join('')}</table>`
    : `<p class="mu" style="font-size:12px;color:${EMAIL_C.muted};margin:0">Hidden: fewer than ${MIN_GROUP} people.</p>`)
  const topRows = (title: string, list: TopEvent[], unit: string) => list.length
    ? `<p class="tx" style="font-size:13px;font-weight:700;margin:12px 0 4px;color:${EMAIL_C.ink}">${title}</p><table style="width:100%;border-collapse:collapse;font-size:13px">${list.map((e) => `<tr><td style="padding:3px 6px">${titleLink(e.id, e.title)}</td><td class="tx" style="padding:3px 6px;text-align:right;width:90px;color:${EMAIL_C.ink}">${n(e.count)} ${unit}</td></tr>`).join('')}</table>`
    : ''
  const fromDay = shiftDay(metricDay(), -6)
  const unlockedIds = new Set(events.filter((event) => pro || event.promotions.length > 0).map((event) => event.id))
  const weekRows = await prisma.engagementDay.findMany({
    where: { eventId: { in: events.map((event) => event.id) }, day: { gte: fromDay }, kind: { in: ['VIEW', 'TICKET', 'SAVE', 'REACTION'] } },
    select: { eventId: true, day: true, kind: true, count: true },
  }).catch(() => [])
  let weekOpened = 0
  let weekTicket = 0
  let weekSaves = 0
  let weekReactions = 0
  for (const row of weekRows) {
    if ((row.kind === 'VIEW' || row.kind === 'TICKET') && !unlockedIds.has(row.eventId)) continue
    if (row.kind === 'VIEW') weekOpened += row.count
    else if (row.kind === 'TICKET') weekTicket += row.count
    else if (row.kind === 'SAVE') weekSaves += row.count
    else if (row.kind === 'REACTION') weekReactions += row.count
  }
  const privateWeek = unlockedIds.size > 0
  const tip = reachTips({
    showPrivate: privateWeek,
    hasImage: true,
    opened: weekOpened,
    seen: 0,
    saves: weekSaves,
    ticket: weekTicket,
    reactions: weekReactions,
    peakHour: null,
    peakDay: peakWeekday(weekRows.filter((row) => row.kind === 'VIEW' && unlockedIds.has(row.eventId)).map((row) => ({ day: row.day, count: row.count }))),
    clashes: 0,
    shareLinks: 1,
    venue: false,
  })[0] ?? null
  const recap = recapFragment({
    opened: privateWeek ? weekOpened : null,
    ticket: privateWeek ? weekTicket : null,
    saves: weekSaves,
    reactions: weekReactions,
    tip,
    benchmark: null,
    unsubUrl: reportUnsubscribeUrl(userId),
  })

  if (ins) {
    const known = new Set(events.map((event) => event.id))
    const extra = [...new Set([...ins.topSaved, ...ins.topShared, ...ins.topItinerary].map((event) => event.id))].filter((id) => !known.has(id))
    if (extra.length) {
      const linked = await prisma.event.findMany({
        where: { id: { in: extra } },
        select: { id: true, title: true, date: true, endDate: true, city: true, hidden: true, moderationStatus: true, deletedAt: true, approvalState: true },
      }).catch(() => [])
      for (const row of linked) {
        const href = publicReportHref(row, base)
        if (href) hrefFor.set(row.id, href)
      }
    }
  }

  const audience = !ins ? '' : `<h2 class="tx" style="font-size:15px;margin:24px 0 6px;color:${EMAIL_C.ink}">Who's into your events</h2>
  ${ins.enough
    ? `<p class="tx" style="font-size:13px;color:${EMAIL_C.ink};margin:0">About ${n(ins.audienceApprox)}+ interested people.</p>${shareRows('Age bands', ins.ageBands)}${shareRows('Home areas', ins.areas)}${shareRows('Also into', ins.interests)}${shareRows('How far ahead they plan', ins.planAhead)}`
    : `<p class="tx" style="font-size:13px;color:${EMAIL_C.ink};margin:0">The crowd's still gathering! Age bands, home areas and more appear once ${MIN_GROUP}+ signed-in people engage with your events.</p>`}
  ${topRows('Most saved', ins.topSaved, 'saves')}${topRows('Most shared', ins.topShared, 'shares')}${topRows('Most added to itineraries', ins.topItinerary, 'adds')}
  <p class="mu" style="font-size:11px;color:${EMAIL_C.muted};margin-top:10px">${escapeHtml(AUDIENCE_DISCLAIMER)}</p>`

  const html = emailDocument({
    title: 'Your VibePeep event performance report',
    preheader: 'How your listings are tracking on VibePeep.',
    manageHref: `${base}/promoter`,
    banner: 'promoter-report',
    homeHref: base,
    unsubscribeHref: reportUnsubscribeUrl(userId),
    reason: 'You turned on weekly recaps in the Promoter dashboard. The unsubscribe link in this email turns them off straight away and leaves your newsletter choice alone.',
    rows: emailBodyCell(`<h1 class="tx" style="font-size:20px;margin:0 0 6px;color:${EMAIL_C.ink}">Your event performance report</h1>
  <p class="tx" style="font-size:14px;color:${EMAIL_C.ink};margin:0 0 16px">Hi ${escapeHtml(user.orgName || user.name || 'there')}, here's the read on your listings. Figures are totals since each one went live.</p>
  <table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr class="mu" style="color:${EMAIL_C.muted};font-size:12px;text-align:left"><th style="padding:6px">Event</th><th style="padding:6px;text-align:right">Views</th><th style="padding:6px;text-align:right">Ticket clicks</th><th style="padding:6px;text-align:right">CTR</th><th style="padding:6px;text-align:right">Saves / going</th></tr></thead><tbody>${rows}</tbody></table>
  ${referralBlock}
  ${recap.html}
  ${audience}
  ${pro ? '' : `<p class="mu" style="font-size:12px;color:${EMAIL_C.muted};margin-top:12px">"Locked" figures unlock when an event is promoted, or for every event with Promoter Pro.</p>`}
  <div style="margin:24px 0">${emailButton(`${base}/promoter`, 'Open Promoter Dashboard')}</div>
  `),
  })

  const res = await sendEmail({
    to: user.email,
    subject: 'Your VibePeep week, in one note',
    html,
    text: recap.text,
    kind: 'report',
    unsubscribeUrl: reportUnsubscribeApiUrl(userId),
  })
  if (!res.ok) return { ok: false, error: res.error ?? 'Email failed' }
  await prisma.user.update({ where: { id: userId }, data: { lastReportAt: new Date() } })
  return { ok: true, events: events.length }
}

/** Sends weekly reports to opted-in promoters whose last report is at least 7 days old. */
export async function runWeeklyPromoterReports() {
  if (!emailSendingEnabled()) return { candidates: 0, sent: 0, skipped: 0 }
  const cutoff = new Date(Date.now() - 7 * 86400000 + 3600000)
  const users = await prisma.user.findMany({
    where: {
      weeklyReport: true,
      role: { in: ['PROMOTER', 'ADMIN'] },
      OR: [{ lastReportAt: null }, { lastReportAt: { lt: cutoff } }],
      NOT: { AND: [{ email: { startsWith: 'outza-tester+qa-' } }, { email: { endsWith: '@mail.grokbot.com' } }] },
    },
    select: { id: true }, take: 200,
  })
  let sent = 0, skipped = 0
  for (const u of users) {
    const r = await sendPromoterReport(u.id).catch(() => ({ ok: false }))
    if (r.ok) sent++; else skipped++
  }
  return { candidates: users.length, sent, skipped }
}
