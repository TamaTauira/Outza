import { EMAIL_C, emailBodyCell, emailButton, emailDocument } from '@/lib/email-brand'
import { escapeHtml } from '@/lib/email'
import { siteUrl } from '@/lib/site-url'

export type DigestMailItem = {
  summary: string
  approveUrl: string
  declineUrl: string
}

/** One Monday email. The caller skips the send when `items` is empty. */
export function digestEmail(input: { items: DigestMailItem[]; handled: number; extra: number; undoUrl: string }): { subject: string; html: string } {
  const count = input.items.length + input.extra
  const subject = `VibePeep approvals: ${count} item${count === 1 ? '' : 's'} need you`
  const blocks = input.items.map((item) => `
    <div class="card" style="background:#ffffff;border:1px solid ${EMAIL_C.line};padding:16px;border-radius:12px;margin:0 0 12px;">
      <p class="tx" style="margin:0 0 14px;white-space:pre-wrap;">${escapeHtml(item.summary)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding-right:8px;">${emailButton(item.approveUrl, 'Approve')}</td>
        <td>${emailButton(item.declineUrl, 'Decline')}</td>
      </tr></table>
    </div>`).join('')
  const more = input.extra > 0
    ? `<p class="mu" style="color:${EMAIL_C.muted};">And ${input.extra} more on the Operations page.</p>`
    : ''
  const home = siteUrl()
  const html = emailDocument({
    title: subject,
    preheader: `${count} waiting. Bots handled ${input.handled} this week.`,
    manageHref: input.undoUrl,
    banner: 'ops-digest',
    homeHref: home,
    reason: 'Each link works once and expires in 14 days. A decision can be undone for 30 days.',
    rows: emailBodyCell(`<h2 style="margin:0 0 8px;font-size:22px;letter-spacing:-0.02em;">Approvals for this week</h2>
    <p style="margin:0 0 16px;">Bots handled ${input.handled} item${input.handled === 1 ? '' : 's'} this week. <a href="${escapeHtml(input.undoUrl)}">Undo here</a>.</p>
    ${blocks}${more}`),
  })
  return { subject, html }
}
