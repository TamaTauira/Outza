/** Outbound mail is off. Nothing is sent to Abacus or any other mail API. */
export function emailSendingEnabled(): boolean {
  return false
}

export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
  senderAlias?: string
}): Promise<{ ok: boolean; disabled?: boolean; error?: string }> {
  void opts
  return { ok: false, disabled: true, error: 'Email sending is turned off' }
}

export const OWNER_EMAIL = 'tama.tauira@gmail.com'

export function escapeHtml(s: string | null | undefined) {
  return (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export { siteUrl } from '@/lib/site-url'
