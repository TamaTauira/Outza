/** Sends an email via the Abacus notification API. Returns { ok, disabled }. */
export async function sendEmail(opts: {
  notificationId: string | undefined
  to: string
  subject: string
  html: string
  senderAlias?: string
}): Promise<{ ok: boolean; disabled?: boolean; error?: string }> {
  const apiKey = process.env.ABACUSAI_API_KEY
  const appId = process.env.WEB_APP_ID
  if (!apiKey || !appId || !opts.notificationId) return { ok: false, error: 'Email not configured' }
  let host = 'mail.abacusai.app'
  try { if (process.env.NEXTAUTH_URL) host = new URL(process.env.NEXTAUTH_URL).hostname } catch {}
  try {
    const res = await fetch('https://apps.abacus.ai/api/sendNotificationEmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        app_id: appId,
        notification_id: opts.notificationId,
        subject: opts.subject,
        body: opts.html,
        is_html: true,
        recipient_email: opts.to,
        sender_email: `noreply@${host}`,
        sender_alias: opts.senderAlias ?? 'Outza',
      }),
      signal: AbortSignal.timeout(20000),
    })
    const result = await res.json().catch(() => ({}))
    if (result?.notification_disabled) return { ok: true, disabled: true }
    if (!res.ok || result?.success === false) return { ok: false, error: result?.message || result?.error || `HTTP ${res.status}` }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'send failed' }
  }
}

export const OWNER_EMAIL = 'tama.tauira@gmail.com'

export function escapeHtml(s: string | null | undefined) {
  return (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export function siteUrl() {
  return (process.env.NEXTAUTH_URL || 'https://sydneyupcoming.abacusai.app').replace(/\/$/, '')
}
