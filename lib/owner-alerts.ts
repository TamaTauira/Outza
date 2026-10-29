import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendEmail, emailSendingEnabled, OWNER_EMAIL, escapeHtml, siteUrl } from '@/lib/email'
import { emailLockup } from '@/lib/email-brand'

const FAULT_REEMAIL_MS = 6 * 60 * 60 * 1000 // same fault re-emails at most every 6h
const MAX_FAULT_EMAILS_PER_HOUR = 10
const DIGEST_EVERY_MS = 14 * 24 * 60 * 60 * 1000
const DIGEST_KEY = 'ideas-digest'

/** Ops inbox that receives every fault alert when FAULT_ALERT_EXTRA_RECIPIENTS is unset. */
export const DEFAULT_FAULT_ALERT_EXTRA_RECIPIENTS = 'outza-tester+faults@mail.grokbot.com'

const EMAIL_TOKEN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const fingerprint = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16)

export type FaultReport = {
  area: string
  title: string
  detail?: string
  key?: string
  /** Route or cron path that owns the fault, e.g. `/api/cron/refresh`. */
  route?: string
  error?: string
  stack?: string
}

function clip(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed ? trimmed.slice(0, max) : null
}

/** Comma-separated extra inboxes. Unset uses the ops default. An empty value sends to the owner only. */
export function faultAlertExtraRecipients(raw: string | undefined = process.env.FAULT_ALERT_EXTRA_RECIPIENTS): string[] {
  const source = raw === undefined ? DEFAULT_FAULT_ALERT_EXTRA_RECIPIENTS : raw
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of source.split(',')) {
    const wrapped = part.match(/<([^>]+)>/)
    const email = (wrapped ? wrapped[1] : part).trim()
    if (!EMAIL_TOKEN.test(email)) continue
    const id = email.toLowerCase()
    if (seen.has(id)) continue
    seen.add(id)
    out.push(email)
  }
  return out
}

/** Extra recipients for this send, excluding the owner so they are not mailed twice. */
export function faultAlertCopyRecipients(owner = OWNER_EMAIL): string[] {
  const skip = owner.trim().toLowerCase()
  return faultAlertExtraRecipients().filter((email) => email.toLowerCase() !== skip)
}

/** Cron or page path a fixer should open for this fault. */
export function faultRouteFor(opts: { area: string; key?: string; route?: string; detail?: string | null }): string {
  const explicit = opts.route?.trim()
  if (explicit) return explicit.slice(0, 300)
  const key = opts.key ?? ''
  if (key.startsWith('refresh') || opts.area === 'Event refresh') return '/api/cron/refresh'
  if (key.startsWith('newsletter') || opts.area === 'Newsletter') return '/api/cron/digest'
  if (key.startsWith('ideas-digest') || opts.area === 'Owner emails') return '/api/cron/owner-alerts'
  if (key.startsWith('intel-') || opts.area === 'VibePeep Intelligence') return '/api/cron/intel'
  const labelled = (opts.detail ?? '').match(/^(?:Path|Page):\s*(\/\S*)/m)
  return labelled?.[1]?.slice(0, 300) ?? ''
}

/** Last error message and stack, from the explicit fields or the stored detail. */
export function faultErrorParts(opts: { detail?: string | null; error?: string; stack?: string }): { error: string | null; stack: string | null } {
  const detail = (opts.detail ?? '').replace(/\r\n/g, '\n').trim()
  const stackAt = detail.search(/\n[ \t]+at \S/)
  const extractedStack = stackAt === -1 ? null : detail.slice(stackAt).trim() || null
  const head = (stackAt === -1 ? detail : detail.slice(0, stackAt)).trim()
  const errLine = head.split('\n').map((line) => line.trim()).reverse().find((line) => /^(?:[A-Za-z_$][\w.]*)?(?:Error|Exception): /.test(line))
  return {
    error: clip(opts.error, 4000) ?? clip(errLine || head, 4000),
    stack: clip(opts.stack, 4000) ?? clip(extractedStack, 4000),
  }
}

/**
 * One JSON object on the line after VIBEPEEP_FAULT.
 * Keys stay in this order: area, first_seen, latest, count, route, error, stack.
 */
export function faultMachineBlock(facts: {
  area: string
  firstSeen: Date
  latest: Date
  count: number
  route: string
  error: string | null
  stack: string | null
}): string {
  const payload = {
    area: facts.area,
    first_seen: facts.firstSeen.toISOString(),
    latest: facts.latest.toISOString(),
    count: facts.count,
    route: facts.route,
    error: facts.error,
    stack: facts.stack,
  }
  return `VIBEPEEP_FAULT\n${JSON.stringify(payload)}`
}

/** Records a serious fault and emails the owner straight away (deduped per fault, throttled). Never throws. */
export async function reportFault(opts: FaultReport) {
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
    if (process.env.NODE_ENV !== 'production' || !emailSendingEnabled()) return
    if (row.lastEmailedAt && now.getTime() - row.lastEmailedAt.getTime() < FAULT_REEMAIL_MS) return
    const recent = await prisma.ownerAlert.count({ where: { kind: 'FAULT', lastEmailedAt: { gte: new Date(now.getTime() - 3600_000) } } })
    if (recent >= MAX_FAULT_EMAILS_PER_HOUR) return
    // Claim the send first so concurrent reports of the same fault don't double-email.
    const claimed = await prisma.ownerAlert.updateMany({
      where: { id: row.id, lastEmailedAt: row.lastEmailedAt },
      data: { lastEmailedAt: now },
    })
    if (!claimed.count) return
    const route = faultRouteFor({ area: opts.area, key: opts.key, route: opts.route, detail })
    const parts = faultErrorParts({ detail, error: opts.error, stack: opts.stack })
    const block = faultMachineBlock({
      area: opts.area,
      firstSeen: row.firstSeen,
      latest: now,
      count: row.count,
      route,
      error: parts.error,
      stack: parts.stack,
    })
    const html = `
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
    ${emailLockup()}
    <h2 style="color:#d92d20;margin-bottom:4px;">VibePeep fault detected</h2>
    <p style="color:#444;margin-top:0;">${escapeHtml(title)}</p>
    <div style="background:#fff4f2;border-left:4px solid #d92d20;padding:14px 16px;border-radius:6px;">
      <p style="margin:0 0 6px;"><strong>Area:</strong> ${escapeHtml(opts.area)}</p>
      <p style="margin:0 0 6px;"><strong>Seen:</strong> ${row.count} time${row.count === 1 ? '' : 's'} since ${row.firstSeen.toISOString()}</p>
      <p style="margin:0 0 6px;"><strong>Latest:</strong> ${now.toISOString()}</p>
      ${route ? `<p style="margin:0;"><strong>Route:</strong> ${escapeHtml(route)}</p>` : ''}
    </div>
    ${detail ? `<pre style="background:#f6f6f6;padding:12px;border-radius:6px;white-space:pre-wrap;font-size:12px;">${escapeHtml(detail)}</pre>` : ''}
    <pre data-vibepeep-fault="1" style="background:#f6f6f6;padding:12px;border-radius:6px;white-space:pre-wrap;font-size:12px;">${escapeHtml(block)}</pre>
    <p style="color:#666;font-size:12px;">Site: ${escapeHtml(siteUrl())}. Repeats of this same fault are bundled: you'll get at most one email about it every 6 hours.</p>
  </div>`
    const text = `${title}\n\nArea: ${opts.area}\nSeen: ${row.count} since ${row.firstSeen.toISOString()}\nLatest: ${now.toISOString()}${route ? `\nRoute: ${route}` : ''}${detail ? `\n\n${detail}` : ''}\n\n${block}`
    const subject = `[VibePeep fault] ${title.slice(0, 90)}`
    const res = await sendEmail({ to: OWNER_EMAIL, subject, html, text })
    if (!res.ok) {
      console.error('[alerts] fault email failed:', res.error)
      await prisma.ownerAlert.update({ where: { id: row.id }, data: { lastEmailedAt: row.lastEmailedAt } }).catch(() => {})
      return
    }
    for (const to of faultAlertCopyRecipients()) {
      const copy = await sendEmail({ to, subject, html, text })
      if (!copy.ok) console.error('[alerts] fault email copy failed:', copy.error)
    }
  } catch (e: any) {
    console.error('[alerts] reportFault failed:', e?.message)
  }
}

/**
 * Hourly health checks for faults that don't throw (stalled refreshes, failing newsletter sends).
 * `completed` is the cycle log written after every chunk has finished. A source that failed
 * or stopped at its time budget does not flip that to failed, so this only fires when a
 * whole cycle never finished.
 */
export async function runHealthChecks() {
  const now = Date.now()
  const lastOk = await prisma.refreshLog.findFirst({ where: { status: 'completed' }, orderBy: { startedAt: 'desc' } })
  if (!lastOk || now - lastOk.startedAt.getTime() > 6 * 3600_000) {
    await reportFault({ area: 'Event refresh', key: 'refresh-stale', route: '/api/cron/refresh', title: 'No successful listings refresh in over 6 hours', detail: lastOk ? `Last successful refresh started ${lastOk.startedAt.toISOString()}` : 'No successful refresh on record' })
  }
  const since = new Date(now - 3600_000)
  const failed = await prisma.newsletterSend.findMany({ where: { status: 'FAILED', sentAt: { gte: since } }, select: { error: true }, take: 50 })
  if (failed.length >= 3) {
    await reportFault({ area: 'Newsletter', key: 'newsletter-failed', route: '/api/cron/digest', title: `${failed.length} subscriber emails failed to send in the last hour`, detail: [...new Set(failed.map((f) => f.error ?? 'unknown'))].slice(0, 5).join('\n') })
  }
  const blocked = await prisma.newsletterSend.count({ where: { status: 'BLOCKED', sentAt: { gte: since } } })
  if (blocked >= 3) {
    await reportFault({ area: 'Newsletter', key: 'newsletter-blocked', route: '/api/cron/digest', title: `${blocked} newsletter issues were blocked by QA in the last hour`, detail: 'Open /admin/newsletter to see the QA errors.' })
  }
}

/** Fortnightly ideas summary: only sends when there are new suggestions and 14+ days have passed since the last one. */
export async function runIdeasDigest(opts: { force?: boolean } = {}) {
  if (!emailSendingEnabled()) return { sent: false, reason: 'email off' }
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
    ${emailLockup()}
    <h2 style="color:#FF7A1A;margin-bottom:4px;">Your fortnightly ideas summary</h2>
    <p style="color:#444;margin-top:0;">${ideas.length} new idea${ideas.length === 1 ? '' : 's'} (${promoters} from promoters, ${ideas.length - promoters} from event-goers) since the last summary.</p>
    ${rows}
  </div>`
  const res = await sendEmail({ to: OWNER_EMAIL, subject: `VibePeep ideas: ${ideas.length} new suggestion${ideas.length === 1 ? '' : 's'} this fortnight`, html })
  if (!res.ok) {
    await reportFault({ area: 'Owner emails', key: 'ideas-digest-failed', route: '/api/cron/owner-alerts', title: 'Fortnightly ideas summary failed to send', detail: res.error })
    return { sent: false, reason: res.error }
  }
  await prisma.suggestion.updateMany({ where: { id: { in: ideas.map((s) => s.id) } }, data: { digestedAt: now } })
  await prisma.ownerAlert.update({ where: { key: DIGEST_KEY }, data: { lastEmailedAt: now, lastSeen: now, count: { increment: 1 } } })
  return { sent: true, count: ideas.length }
}
