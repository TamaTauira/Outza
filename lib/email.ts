/**
 * Transactional email via the Resend HTTP API (https://api.resend.com/emails).
 * Sending is on only when RESEND_API_KEY is set. The From domain
 * (RESEND_FROM_EMAIL, or noreply@outza.app by default) must be verified in
 * Resend or the API rejects the send. With no key, nothing is posted.
 */
const RESEND_EMAILS_URL = 'https://api.resend.com/emails'

/** Used when RESEND_FROM_EMAIL is unset. Verify outza.app in Resend first. */
export const DEFAULT_FROM_EMAIL = 'Outza <noreply@outza.app>'

export function emailSendingEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim())
}

function fromAddress(): string {
  return process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL
}

export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
  text?: string
  senderAlias?: string
}): Promise<{ ok: boolean; disabled?: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) return { ok: false, disabled: true, error: 'Email sending is turned off' }
  const to = opts.to?.trim()
  if (!to) return { ok: false, error: 'Missing recipient' }
  try {
    const res = await fetch(RESEND_EMAILS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    })
    const result = await res.json().catch(() => ({} as { message?: unknown }))
    if (!res.ok) {
      const message = typeof result?.message === 'string' && result.message ? result.message : `HTTP ${res.status}`
      return { ok: false, error: message }
    }
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error && e.message ? e.message : 'send failed' }
  }
}

export const OWNER_EMAIL = 'tama.tauira@gmail.com'

export function escapeHtml(s: string | null | undefined) {
  return (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export { siteUrl } from '@/lib/site-url'
