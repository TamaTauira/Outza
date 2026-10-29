/**
 * Transactional email via the Resend HTTP API (https://api.resend.com/emails).
 * Sending is on only when RESEND_API_KEY is set. From is RESEND_FROM_EMAIL,
 * or VibePeep <onboarding@resend.dev> when that is unset.
 * That shared sender can deliver only to the Resend account owner. Everyone
 * else is rejected with HTTP 403 until a domain is verified in Resend and
 * RESEND_FROM_EMAIL is an address on that domain. With no key, nothing is posted.
 */
const RESEND_EMAILS_URL = 'https://api.resend.com/emails'

/** Used when RESEND_FROM_EMAIL is unset. Resend's shared sender; account owner only. */
export const DEFAULT_FROM_EMAIL = 'VibePeep <onboarding@resend.dev>'

const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

export type SendEmailResult = {
  ok: boolean
  disabled?: boolean
  /** True when Resend refused because the From address cannot mail this recipient. */
  restricted?: boolean
  error?: string
}

export function emailSendingEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim())
}

function fromAddress(): string {
  return process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL
}

/** True when mail is still going out from Resend's shared onboarding sender. */
export function isResendTestSender(from = fromAddress()): boolean {
  return /onboarding@resend\.dev/i.test(from)
}

export function redactEmails(value: string | null | undefined): string {
  return String(value ?? '').replace(EMAIL_IN_TEXT, '[redacted]')
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

export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
  text?: string
  senderAlias?: string
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    console.error('[email] skipped: RESEND_API_KEY is not set')
    return { ok: false, disabled: true, error: 'Email sending is turned off' }
  }
  const to = opts.to?.trim()
  if (!to) return { ok: false, error: 'Missing recipient' }
  const from = fromAddress()
  try {
    const res = await fetch(RESEND_EMAILS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
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

/**
 * What a signed-in person may see when mail fails.
 * Provider bodies often name the account that owns the API key. That address stays off this string.
 */
export function publicEmailError(raw?: string | null): string {
  const msg = String(raw ?? '')
  const redacted = redactEmails(msg)
  if (redacted && redacted !== msg) console.error('[email]', redacted)
  if (/turned off/i.test(msg)) return 'Email sending is turned off on this site.'
  if (/testing emails|verify a domain|domain is not verified|not verified|onboarding@resend|can only send/i.test(msg)) {
    return 'We couldn’t send that email. Sending is still on Resend’s shared test sender, which can only deliver to the Resend account owner. Verify a domain in Resend, then set RESEND_FROM_EMAIL to an address on that domain.'
  }
  return 'We couldn’t send that email just now. Please try again in a few minutes.'
}

export const OWNER_EMAIL = 'tama.tauira@gmail.com'

export function escapeHtml(s: string | null | undefined) {
  return (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export { siteUrl } from '@/lib/site-url'
