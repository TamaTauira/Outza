import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendEmail, emailSendingEnabled, OWNER_EMAIL, escapeHtml, siteUrl } from '@/lib/email'
import { EMAIL_C, emailBodyCell, emailDocument, emailPanel } from '@/lib/email-brand'
import { TRANSIENT_WINDOW_MS, foldTransientSessions } from '@/lib/network-fault'

const FAULT_REEMAIL_MS = 6 * 60 * 60 * 1000 // same fault re-emails at most every 6h
const MAX_FAULT_EMAILS_PER_HOUR = 10

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

/** Comma-separated extra inboxes. Unset or empty sends to the owner only. */
export function faultAlertExtraRecipients(raw: string | undefined = process.env.FAULT_ALERT_EXTRA_RECIPIENTS): string[] {
  const source = raw ?? ''
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

/**
 * Whether two addresses land in the same inbox. Gmail ignores dots and
 * plus-tags in the local part, and googlemail.com is the same mailbox, so
 * an extra recipient written as one of those forms still mails the owner a
 * second copy of every fault.
 */
export function sameInbox(a: string, b: string): boolean {
  const norm = (raw: string) => {
    const email = raw.trim().toLowerCase()
    const at = email.lastIndexOf('@')
    if (at < 0) return email
    let local = email.slice(0, at)
    let domain = email.slice(at + 1)
    if (domain === 'googlemail.com') domain = 'gmail.com'
    if (domain === 'gmail.com') local = local.split('+')[0].replace(/\./g, '')
    return `${local}@${domain}`
  }
  return norm(a) === norm(b)
}

/** Extra recipients for this send, excluding the owner's own inbox so they are not mailed twice. */
export function faultAlertCopyRecipients(owner = OWNER_EMAIL): string[] {
  return faultAlertExtraRecipients().filter((email) => !sameInbox(email, owner))
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

/** Human fault time in Australia/Sydney. The machine block keeps ISO UTC. */
export function faultTimestamp(date: Date): string {
  const formatted = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
  return `${formatted} ${sydneyZoneName(date)}`
}

function sydneyZoneName(date: Date): 'AEST' | 'AEDT' {
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
  const offsetMin = Math.round((asUtc - date.getTime()) / 60000)
  return offsetMin >= 660 ? 'AEDT' : 'AEST'
}

const TRANSIENT_KEY = 'fault:transient-network'

/**
 * Counts a stackless fetch failure. One phone on a bad signal is logged and
 * does not email. Enough distinct sessions in a short window still emails,
 * so a real outage is not silent. Never throws.
 */
export async function noteTransientNetwork(opts: { route: string; message: string; sessionId: string; page?: string }) {
  try {
    const now = new Date()
    const folded = await prisma.$transaction(async (tx) => {
      const existing = await tx.ownerAlert.findUnique({ where: { key: TRANSIENT_KEY } })
      const next = foldTransientSessions(existing?.detail ?? null, opts.sessionId, now.getTime())
      const detail = JSON.stringify(next.ledger)
      await tx.ownerAlert.upsert({
        where: { key: TRANSIENT_KEY },
        create: { key: TRANSIENT_KEY, kind: 'NETWORK', title: 'Transient network errors', detail, count: 1 },
        update: { count: { increment: 1 }, lastSeen: now, detail, title: 'Transient network errors' },
      })
      return next
    })
    const where = opts.page || opts.route || '/'
    console.warn(`[network] ${opts.message} on ${where} (${folded.distinct} sessions in ${TRANSIENT_WINDOW_MS / 60000}m)`)
    if (!folded.spike) return
    await reportFault({
      area: 'Network',
      key: 'transient-network-spike',
      route: opts.route || '/',
      title: `Fetch failures from ${folded.distinct} sessions in ${TRANSIENT_WINDOW_MS / 60000} minutes`,
      error: opts.message,
      detail: `Sessions: ${folded.distinct}\nLatest page: ${where}\nMessage: ${opts.message}\n\nA single dropped connection is not a page crash. This email means many browsers lost the network at once.`,
    })
  } catch (e: any) {
    console.error('[network] transient note failed:', e?.message)
  }
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
    const seen = faultTimestamp(row.firstSeen)
    const latest = faultTimestamp(now)
    const home = siteUrl()
    const html = emailDocument({
      title: 'VibePeep fault detected',
      preheader: `${opts.area}: open the note for the route and the stack.`,
      manageHref: `${home}/admin`,
      manageLabel: 'Admin',
      banner: 'owner-fault',
      homeHref: home,
      reason: 'Repeats of this same fault are bundled: at most one email every 6 hours.',
      rows: emailBodyCell(`<h2 class="danger" style="color:${EMAIL_C.danger};margin:0 0 8px;font-size:20px;line-height:1.25;">VibePeep fault detected</h2>
    <p class="tx" style="margin:0 0 12px;color:${EMAIL_C.ink};">${escapeHtml(title)}</p>
    ${emailPanel(`<p class="tx" style="margin:0 0 6px;color:${EMAIL_C.ink};"><strong>Area:</strong> ${escapeHtml(opts.area)}</p>
      <p class="tx" style="margin:0 0 6px;color:${EMAIL_C.ink};"><strong>Seen:</strong> ${row.count} time${row.count === 1 ? '' : 's'} since ${escapeHtml(seen)}</p>
      <p class="tx" style="margin:0 0 6px;color:${EMAIL_C.ink};"><strong>Latest:</strong> ${escapeHtml(latest)}</p>
      ${route ? `<p class="tx" style="margin:0;color:${EMAIL_C.ink};"><strong>Route:</strong> ${escapeHtml(route)}</p>` : ''}`, 'danger')}
    ${detail ? emailPanel(`<pre class="tx" style="margin:0;white-space:pre-wrap;font-size:12px;color:${EMAIL_C.ink};">${escapeHtml(detail)}</pre>`) : ''}
    ${emailPanel(`<pre data-vibepeep-fault="1" class="tx" style="margin:0;white-space:pre-wrap;font-size:12px;color:${EMAIL_C.ink};">${escapeHtml(block)}</pre>`)}`),
    })
    const text = `${title}\n\nArea: ${opts.area}\nSeen: ${row.count} since ${seen}\nLatest: ${latest}${route ? `\nRoute: ${route}` : ''}${detail ? `\n\n${detail}` : ''}\n\n${block}`
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
  const { readHeartbeats } = await import('@/lib/job-watermark')
  const { lateHeartbeats } = await import('@/lib/ops/watchdog')
  const beats = await readHeartbeats().catch(() => [])
  for (const late of lateHeartbeats(beats.map((beat) => ({ name: beat.name, at: beat.at.getTime() })), now)) {
    const hours = Math.round(late.ageMs / 3600_000)
    await reportFault({
      area: 'Scheduled jobs',
      key: `cron-late-${late.name}`,
      route: '/admin/ops',
      title: `${late.name} has not finished in ${hours} hours`,
      detail: `Expected at least every ${Math.round(late.limitMs / 2 / 3600_000)} hours. Listings already stored were not changed.`,
    })
  }
}

export { runIdeasDigest } from '@/lib/ideas-digest'
