/**
 * Outbound mail. Yahoo SMTP is used when SMTP_HOST, SMTP_USER and SMTP_PASS
 * are all set (smtp.mail.yahoo.com:465, secure). The From address is the
 * Yahoo account: EMAIL_FROM, or SMTP_USER when that is unset, shown as
 * VibePeep <account>. Reply-To is that same sender.
 * Resend (https://api.resend.com/emails) is the fallback for when a domain
 * is verified later and the SMTP settings are removed. From is then
 * RESEND_FROM_EMAIL, or VibePeep <onboarding@resend.dev>. That shared sender
 * can deliver only to the Resend account owner.
 * With neither transport configured, nothing is sent.
 * Yahoo allows about 500 messages a day. SMTP sends are queued one at a time
 * with a short gap, and further sends stop once that cap is hit.
 */
import { createHash } from 'crypto'
import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

const RESEND_EMAILS_URL = 'https://api.resend.com/emails'

/** Used when RESEND_FROM_EMAIL is unset. Resend's shared sender; account owner only. */
export const DEFAULT_FROM_EMAIL = 'VibePeep <onboarding@resend.dev>'

const SMTP_DISPLAY_NAME = 'VibePeep'
/** Yahoo Mail's published daily cap for a regular mailbox. */
export const YAHOO_DAILY_CAP = 500
/** Gap between SMTP messages so a digest does not burst the mailbox. */
const SMTP_GAP_MS = 300
const CAP_ERROR = 'Yahoo daily send cap reached'
const AUTH_ERROR = 'SMTP auth failed'
const QUOTA_KIND = 'quota'

const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

export type SendEmailResult = {
  ok: boolean
  disabled?: boolean
  /** True when Resend refused because the From address cannot mail this recipient. */
  restricted?: boolean
  error?: string
}

type OutboundMessage = {
  from: string
  to: string
  replyTo: string
  subject: string
  html: string
  text?: string
  envelope: { from: string; to: string }
}

type MailSender = {
  sendMail: (message: OutboundMessage) => Promise<unknown>
}

type SmtpJob = { result: SendEmailResult; pace: boolean }

let senderOverride: MailSender | null = null
let testQuota: (() => Promise<number>) | null = null
let gapOverride: number | null = null
let smtpChain: Promise<void> = Promise.resolve()
let transport: Transporter | null = null
let transportKey = ''
let memoryDay = ''
let memoryCount = 0
let heldUntilDay = ''
let capLoggedDay = ''
let warnedFromMismatch = false

function envTrim(name: string): string {
  return process.env[name]?.trim() ?? ''
}

export function smtpConfigured(): boolean {
  return Boolean(envTrim('SMTP_HOST') && envTrim('SMTP_USER') && envTrim('SMTP_PASS'))
}

export function activeMailTransport(): 'smtp' | 'resend' | 'off' {
  if (smtpConfigured()) return 'smtp'
  if (envTrim('RESEND_API_KEY')) return 'resend'
  return 'off'
}

export function emailSendingEnabled(): boolean {
  return activeMailTransport() !== 'off'
}

function smtpPort(): number {
  const raw = envTrim('SMTP_PORT')
  const port = raw ? Number(raw) : 465
  return Number.isInteger(port) && port > 0 ? port : 465
}

/** Options passed to nodemailer. `secure` is true on port 465 (Yahoo). */
export function smtpTransportOptions(): {
  host: string
  port: number
  secure: boolean
  auth: { user: string; pass: string }
} | null {
  if (!smtpConfigured()) return null
  const port = smtpPort()
  return {
    host: envTrim('SMTP_HOST'),
    port,
    secure: port === 465,
    auth: { user: envTrim('SMTP_USER'), pass: envTrim('SMTP_PASS') },
  }
}

function mailboxOf(value: string): string {
  const wrapped = value.match(/<([^>]+)>/)
  return (wrapped ? wrapped[1] : value).trim()
}

function displayNameOf(value: string): string {
  const named = value.match(/^\s*"?([^"<]+?)"?\s*</)
  const name = named?.[1]?.trim()
  return name || SMTP_DISPLAY_NAME
}

/**
 * Sender shown on SMTP mail. The address is always SMTP_USER so it equals
 * the Yahoo account. EMAIL_FROM supplies the display name when set.
 */
export function smtpFromAddress(): string {
  const user = envTrim('SMTP_USER')
  const configured = envTrim('EMAIL_FROM') || user
  const mailbox = mailboxOf(configured)
  if (user && mailbox.toLowerCase() !== user.toLowerCase() && !warnedFromMismatch) {
    warnedFromMismatch = true
    console.error('[email] From address must equal the Yahoo account. Using SMTP_USER.')
  }
  return `${displayNameOf(configured)} <${user}>`
}

function resendFromAddress(): string {
  return envTrim('RESEND_FROM_EMAIL') || DEFAULT_FROM_EMAIL
}

/** True when mail is still going out from Resend's shared onboarding sender. */
export function isResendTestSender(from = resendFromAddress()): boolean {
  if (activeMailTransport() !== 'resend') return false
  return /onboarding@resend\.dev/i.test(from)
}

export function redactEmails(value: string | null | undefined): string {
  return String(value ?? '').replace(EMAIL_IN_TEXT, '[redacted]')
}

function scrubSecrets(value: string): string {
  let out = redactEmails(value)
  const pass = envTrim('SMTP_PASS')
  if (pass) out = out.split(pass).join('[redacted]')
  return out
}

function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

function gapMs(): number {
  return gapOverride ?? SMTP_GAP_MS
}

function pause(): Promise<void> {
  const ms = gapMs()
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** One SMTP send at a time, with a gap after each attempt that reached Yahoo. */
function enqueueSmtp(job: () => Promise<SmtpJob>): Promise<SendEmailResult> {
  const run = smtpChain.then(job, job)
  smtpChain = run.then(
    (outcome) => (outcome.pace ? pause() : undefined),
    () => pause(),
  ).then(() => undefined)
  return run.then((outcome) => outcome.result)
}

function noteCap(day: string) {
  if (capLoggedDay === day) return
  capLoggedDay = day
  console.error('[email] Yahoo daily send cap reached (500). Further messages are held until the next UTC day.')
}

async function sendsToday(): Promise<number> {
  if (testQuota) return testQuota()
  const day = utcDay()
  if (memoryDay !== day) {
    memoryDay = day
    memoryCount = 0
  }
  try {
    const { prisma } = await import('./db')
    const start = new Date(`${day}T00:00:00.000Z`)
    const persisted = await prisma.mailDelivery.count({
      where: { kind: QUOTA_KIND, status: 'sent', createdAt: { gte: start } },
    })
    memoryCount = Math.max(memoryCount, persisted)
  } catch (err) {
    console.error('[email] could not count today’s Yahoo sends', err instanceof Error ? err.message : err)
  }
  return memoryCount
}

async function noteSent() {
  const day = utcDay()
  if (memoryDay !== day) {
    memoryDay = day
    memoryCount = 0
  }
  memoryCount += 1
  if (testQuota) return
  try {
    const { prisma } = await import('./db')
    await prisma.mailDelivery.create({ data: { kind: QUOTA_KIND, status: 'sent' } })
  } catch (err) {
    console.error('[email] could not record a Yahoo send toward the daily cap', err instanceof Error ? err.message : err)
  }
}

function errorSummary(err: unknown): string {
  if (!err || typeof err !== 'object') return err instanceof Error ? err.message : 'send failed'
  const record = err as { message?: string; response?: string; code?: string; responseCode?: number }
  const parts = [record.code, record.responseCode ? String(record.responseCode) : '', record.response, record.message]
  return parts.filter(Boolean).join(' ') || 'send failed'
}

function isAuthFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const record = err as { code?: string; responseCode?: number; message?: string; response?: string }
  const text = `${record.message ?? ''} ${record.response ?? ''}`
  return record.code === 'EAUTH' || record.responseCode === 535 || /invalid login|authentication failed|username and password not accepted|535[\s-]/i.test(text)
}

function isProviderCap(err: unknown): boolean {
  const text = errorSummary(err)
  return /daily [\s\S]{0,40}(quota|limit)|sending quota|too many messages|mailbox is full|rate limit exceeded|try again tomorrow/i.test(text)
}

function getTransport(): Transporter {
  const options = smtpTransportOptions()
  if (!options) throw new Error('SMTP is not configured')
  const key = createHash('sha256')
    .update(`${options.host}|${options.port}|${options.secure}|${options.auth.user}|${options.auth.pass}`)
    .digest('hex')
  if (!transport || transportKey !== key) {
    transport = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      auth: options.auth,
      connectionTimeout: 20_000,
      greetingTimeout: 20_000,
      socketTimeout: 20_000,
    })
    transportKey = key
  }
  return transport
}

async function deliverSmtp(opts: { to: string; subject: string; html: string; text?: string }): Promise<SmtpJob> {
  const day = utcDay()
  if (heldUntilDay === day || (await sendsToday()) >= YAHOO_DAILY_CAP) {
    noteCap(day)
    return { result: { ok: false, error: CAP_ERROR }, pace: false }
  }
  const from = smtpFromAddress()
  const message: OutboundMessage = {
    from,
    to: opts.to,
    replyTo: from,
    subject: opts.subject,
    html: opts.html,
    envelope: { from: envTrim('SMTP_USER'), to: opts.to },
    ...(opts.text ? { text: opts.text } : {}),
  }
  try {
    const sender = senderOverride ?? getTransport()
    await sender.sendMail(message)
    await noteSent()
    return { result: { ok: true }, pace: true }
  } catch (err) {
    if (isAuthFailure(err)) {
      console.error(`[email] SMTP auth failed ${scrubSecrets(errorSummary(err))}`)
      return { result: { ok: false, error: AUTH_ERROR }, pace: true }
    }
    if (isProviderCap(err)) {
      heldUntilDay = day
      noteCap(day)
      return { result: { ok: false, error: CAP_ERROR }, pace: true }
    }
    const safe = scrubSecrets(errorSummary(err)) || 'send failed'
    console.error(`[email] SMTP send failed ${safe}`)
    return { result: { ok: false, error: safe }, pace: true }
  }
}

function providerMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const record = body as { message?: unknown; error?: { message?: unknown } }
    if (typeof record.message === 'string' && record.message) return record.message
    if (typeof record.error?.message === 'string' && record.error.message) return record.error.message
  }
  return `HTTP ${status}`
}

function isRestricted(status: number, message: string): boolean {
  return status === 403 || /testing emails|verify a domain|domain is not verified|can only send/i.test(message)
}

async function deliverResend(opts: { to: string; subject: string; html: string; text?: string }): Promise<SendEmailResult> {
  const apiKey = envTrim('RESEND_API_KEY')
  const from = resendFromAddress()
  try {
    const res = await fetch(RESEND_EMAILS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    })
    const result = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message = providerMessage(result, res.status)
      const safe = redactEmails(message)
      const restricted = isRestricted(res.status, message)
      console.error(`[email] Resend rejected send status=${res.status} restricted=${restricted} testSender=${isResendTestSender(from)} ${safe}`)
      if (restricted && isResendTestSender(from)) {
        console.error('[email] Blocker: onboarding@resend.dev can only deliver to the Resend account owner. A verified sending domain is required before other recipients can receive mail. Set RESEND_FROM_EMAIL to an address on that domain.')
      }
      return { ok: false, error: safe, ...(restricted ? { restricted: true } : {}) }
    }
    return { ok: true }
  } catch (e: unknown) {
    const safe = redactEmails(e instanceof Error && e.message ? e.message : 'send failed')
    console.error(`[email] send failed ${safe}`)
    return { ok: false, error: safe }
  }
}

export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
  text?: string
  senderAlias?: string
}): Promise<SendEmailResult> {
  const to = opts.to?.trim()
  if (!to) return { ok: false, error: 'Missing recipient' }
  const transportName = activeMailTransport()
  if (transportName === 'off') {
    console.error('[email] skipped: SMTP is not configured and RESEND_API_KEY is not set')
    return { ok: false, disabled: true, error: 'Email sending is turned off' }
  }
  const message = { to, subject: opts.subject, html: opts.html, text: opts.text }
  if (transportName === 'smtp') return enqueueSmtp(() => deliverSmtp(message))
  return deliverResend(message)
}

/**
 * What a signed-in person may see when mail fails.
 * Provider bodies often name the account that owns the API key. That address stays off this string.
 */
export function publicEmailError(raw?: string | null): string {
  const msg = String(raw ?? '')
  const redacted = redactEmails(msg)
  if (redacted && redacted !== msg) console.error('[email]', redacted)
  if (/turned off/i.test(msg)) return 'Email sending is turned off on this site.'
  if (/smtp auth failed|^EAUTH\b|invalid login|authentication failed|username and password not accepted/i.test(msg)) return AUTH_ERROR
  if (/yahoo daily send cap|sending quota|daily [\s\S]{0,40}(quota|limit)/i.test(msg)) {
    return 'Yahoo daily send cap reached. Sending resumes the next day.'
  }
  if (/testing emails|verify a domain|domain is not verified|not verified|onboarding@resend|can only send/i.test(msg)) {
    return 'We couldn’t send that email. Sending is still on Resend’s shared test sender, which can only deliver to the Resend account owner. Verify a domain in Resend, then set RESEND_FROM_EMAIL to an address on that domain.'
  }
  return 'We couldn’t send that email just now. Please try again in a few minutes.'
}

export const OWNER_EMAIL = 'tama.tauira@gmail.com'

export function escapeHtml(s: string | null | undefined) {
  return (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

/** Test-only seams. Production sends use nodemailer and MailDelivery. */
export function setEmailTestAdapters(adapters: {
  sender?: MailSender | null
  sentToday?: (() => Promise<number>) | null
  gapMs?: number | null
}) {
  if ('sender' in adapters) senderOverride = adapters.sender ?? null
  if ('sentToday' in adapters) testQuota = adapters.sentToday ?? null
  if ('gapMs' in adapters) gapOverride = adapters.gapMs ?? null
}

export function resetEmailTransportForTests() {
  senderOverride = null
  testQuota = null
  gapOverride = null
  smtpChain = Promise.resolve()
  transport = null
  transportKey = ''
  memoryDay = ''
  memoryCount = 0
  heldUntilDay = ''
  capLoggedDay = ''
  warnedFromMismatch = false
}

export { siteUrl } from '@/lib/site-url'
