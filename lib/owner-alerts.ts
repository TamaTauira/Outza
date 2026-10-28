import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendEmail, OWNER_EMAIL, escapeHtml, siteUrl } from '@/lib/email'

const FAULT_REEMAIL_MS = 6 * 60 * 60 * 1000 // same fault re-emails at most every 6h
const MAX_FAULT_EMAILS_PER_HOUR = 10
const DIGEST_EVERY_MS = 14 * 24 * 60 * 60 * 1000
const DIGEST_KEY = 'ideas-digest'

const fingerprint = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16)

/** Records a serious fault and emails the owner straight away (deduped per fault, throttled). Never throws. */
export async function reportFault(opts: { area: string; title: string; detail?: string; key?: string }) {
  try {
    const title = `${opts.area}: ${opts.title}`.slice(0, 200)
    const detail = (opts.detail ?? '').slice(0, 4000) || null
    const key = `fault:${opts.key ?? fingerprint(title)}`
    const now = new Date()
    const row = await prisma.ownerAlert.upsert({
      where: { key },
      create: { key, kind: 'FAULT', title, detail },
      update: { count: { increment: 1 }, lastSeen: now, detail },
    })
    // Faults are recorded everywhere, but only the live site emails (keeps preview/dev noise out of your inbox).
    if (process.env.NODE_ENV !== 'production') return
    if (row.lastEmailedAt && now.getTime() - row.lastEmailedAt.getTime() < FAULT_REEMAIL_MS) return
    const recent = await prisma.ownerAlert.count({ where: { kind: 'FAULT', lastEmailedAt: { gte: new Date(now.getTime() - 3600_000) } } })
    if (recent >= MAX_FAULT_EMAILS_PER_HOUR) return
    // Claim the send first so concurrent reports of the same fault don't double-email.
    const claimed = await prisma.ownerAlert.updateMany({
      where: { id: row.id, lastEmailedAt: row.lastEmailedAt },
      data: { lastEmailedAt: now },
    })
    if (!claimed.count) return
    const html = `
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
    <h2 style="color:#d92d20;margin-bottom:4px;">Outza fault detected</h2>
    <p style="color:#444;margin-top:0;">${escapeHtml(title)}</p>
    <div style="background:#fff4f2;border-left:4px solid #d92d20;padding:14px 16px;border-radius:6px;">
      <p style="margin:0 0 6px;"><strong>Area:</strong> ${escapeHtml(opts.area)}</p>
      <p style="margin:0 0 6px;"><strong>Seen:</strong> ${row.count} time${row.count === 1 ? '' : 's'} since ${row.firstSeen.toISOString()}</p>
      <p style="margin:0;"><strong>Latest:</strong> ${now.toISOString()}</p>
    </div>
    ${detail ? `<pre style="background:#f6f6f6;padding:12px;border-radius:6px;white-space:pre-wrap;font-size:12px;">${escapeHtml(detail)}</pre>` : ''}
    <p style="color:#666;font-size:12px;">Site: ${escapeHtml(siteUrl())}. Repeats of this same fault are bundled: you'll get at most one email about it every 6 hours.</p>
  </div>`
    const res = await sendEmail({ notificationId: process.env.NOTIF_ID_SERIOUS_FAULT_ALERT, to: OWNER_EMAIL, subject: `[Outza fault] ${title.slice(0, 90)}`, html })
    if (!res.ok) {
      console.error('[alerts] fault email failed:', res.error)
      await prisma.ownerAlert.update({ where: { id: row.id }, data: { lastEmailedAt: row.lastEmailedAt } }).catch(() => {})
    }
  } catch (e: any) {
    console.error('[alerts] reportFault failed:', e?.message)
  }
}

/** Hourly health checks for faults that don't throw (stalled refreshes, failing newsletter sends). */
export async function runHealthChecks() {
  const now = Date.now()
  const lastOk = await prisma.refreshLog.findFirst({ where: { status: 'completed' }, orderBy: { startedAt: 'desc' } })
  if (!lastOk || now - lastOk.startedAt.getTime() > 6 * 3600_000) {
    await reportFault({ area: 'Event refresh', key: 'refresh-stale', title: 'No successful listings refresh in over 6 hours', detail: lastOk ? `Last successful refresh started ${lastOk.startedAt.toISOString()}` : 'No successful refresh on record' })
  }
  const since = new Date(now - 3600_000)
  const failed = await prisma.newsletterSend.findMany({ where: { status: 'FAILED', sentAt: { gte: since } }, select: { error: true }, take: 50 })
  if (failed.length >= 3) {
    await reportFault({ area: 'Newsletter', key: 'newsletter-failed', title: `${failed.length} subscriber emails failed to send in the last hour`, detail: [...new Set(failed.map((f) => f.error ?? 'unknown'))].slice(0, 5).join('\n') })
  }
  const blocked = await prisma.newsletterSend.count({ where: { status: 'BLOCKED', sentAt: { gte: since } } })
  if (blocked >= 3) {
    await reportFault({ area: 'Newsletter', key: 'newsletter-blocked', title: `${blocked} newsletter issues were blocked by QA in the last hour`, detail: 'Open /admin/newsletter to see the QA errors.' })
  }
}

/** Fortnightly ideas summary: only sends when there are new suggestions and 14+ days have passed since the last one. */
export async function runIdeasDigest(opts: { force?: boolean } = {}) {
  const marker = await prisma.ownerAlert.findUnique({ where: { key: DIGEST_KEY } })
  const now = new Date()
  if (!marker) {
    // First run anchors the fortnightly schedule.
    await prisma.ownerAlert.create({ data: { key: DIGEST_KEY, kind: 'IDEAS_DIGEST', title: 'Fortnightly ideas summary', lastEmailedAt: now } })
    if (!opts.force) return { sent: false, reason: 'schedule started' }
  } else if (!opts.force && marker.lastEmailedAt && now.getTime() - marker.lastEmailedAt.getTime() < DIGEST_EVERY_MS) {
    return { sent: false, reason: 'not due' }
  }
  const ideas = await prisma.suggestion.findMany({ where: { digestedAt: null }, orderBy: { createdAt: 'asc' }, take: 200 })
  if (!ideas.length) return { sent: false, reason: 'no new suggestions' }

  const promoters = ideas.filter((s) => s.role === 'PROMOTER').length
  const rows = ideas.map((s) => `
      <div style="background:#f6f6f6;padding:12px 14px;border-radius:8px;margin-bottom:10px;">
        <p style="margin:0 0 6px;font-size:12px;color:#666;">${s.createdAt.toISOString().slice(0, 10)} · ${s.role === 'PROMOTER' ? 'Promoter' : 'Event-goer'} · ${escapeHtml(s.name) || 'Anonymous'}${s.email ? ` (${escapeHtml(s.email)})` : ''}</p>
        <p style="margin:0;white-space:pre-wrap;">${escapeHtml(s.message)}</p>
      </div>`).join('')
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
    <h2 style="color:#f9652a;margin-bottom:4px;">Your fortnightly ideas summary</h2>
    <p style="color:#444;margin-top:0;">${ideas.length} new idea${ideas.length === 1 ? '' : 's'} (${promoters} from promoters, ${ideas.length - promoters} from event-goers) since the last summary.</p>
    ${rows}
  </div>`
  const res = await sendEmail({ notificationId: process.env.NOTIF_ID_IDEAS_SUMMARY_FORTNIGHTLY, to: OWNER_EMAIL, subject: `Outza ideas: ${ideas.length} new suggestion${ideas.length === 1 ? '' : 's'} this fortnight`, html })
  if (!res.ok) {
    await reportFault({ area: 'Owner emails', key: 'ideas-digest-failed', title: 'Fortnightly ideas summary failed to send', detail: res.error })
    return { sent: false, reason: res.error }
  }
  await prisma.suggestion.updateMany({ where: { id: { in: ideas.map((s) => s.id) } }, data: { digestedAt: now } })
  await prisma.ownerAlert.update({ where: { key: DIGEST_KEY }, data: { lastEmailedAt: now, lastSeen: now, count: { increment: 1 } } })
  return { sent: true, count: ideas.length }
}
