import { EMAIL_C, emailBodyCell, emailButton, emailDocument, emailLink, emailPanel, emailSenderLine } from '@/lib/email-brand'
import { escapeHtml } from '@/lib/email'
import { siteUrl } from '@/lib/site-url'

export type DigestMailItem = {
  summary: string
  approveUrl: string
  declineUrl: string
}

/** One Monday email. The caller skips the send when `items` is empty. */
export function digestEmail(input: { items: DigestMailItem[]; handled: number; extra: number; undoUrl: string; notes?: string[] }): { subject: string; html: string; text: string } {
  const count = input.items.length + input.extra
  const noun = count === 1 ? 'item' : 'items'
  const verb = count === 1 ? 'needs' : 'need'
  const subject = `VibePeep approvals: ${count} ${noun} ${verb} you`
  const blocks = input.items.map((item) => emailPanel(`
      <p class="tx" style="margin:0 0 14px;white-space:pre-wrap;color:${EMAIL_C.ink};">${escapeHtml(item.summary)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding-right:8px;">${emailButton(item.approveUrl, 'Approve')}</td>
        <td>${emailButton(item.declineUrl, 'Decline', 'secondary')}</td>
      </tr></table>`)).join('')
  const more = input.extra > 0
    ? `<p class="mu" style="color:${EMAIL_C.muted};">And ${input.extra} more on the Operations page.</p>`
    : ''
  const notes = (input.notes ?? []).length
    ? `<p class="tx" style="margin:16px 0 0;color:${EMAIL_C.ink};"><strong>Major dependency updates</strong> stay open for you.</p><ul>${(input.notes ?? []).map((note) => `<li class="tx">${escapeHtml(note)}</li>`).join('')}</ul>`
    : ''
  const home = siteUrl()
  const handledLine = `Bots handled ${input.handled} item${input.handled === 1 ? '' : 's'} this week.`
  const html = emailDocument({
    title: subject,
    preheader: `${count} waiting. ${handledLine}`,
    banner: 'ops-digest',
    homeHref: home,
    reason: 'Each link works once and expires in 14 days. A decision can be undone for 30 days.',
    rows: emailBodyCell(`<h2 class="tx" style="margin:0 0 8px;font-size:20px;line-height:1.25;font-weight:800;color:${EMAIL_C.ink};">Approvals for this week</h2>
    <p class="tx" style="margin:0 0 16px;color:${EMAIL_C.ink};">${handledLine} ${emailLink(input.undoUrl, 'Undo a decision')}.</p>
    ${blocks}${more}${notes}`),
  })
  const text = [
    subject,
    '',
    handledLine,
    `Undo a decision: ${input.undoUrl}`,
    ...input.items.map((item) => `${item.summary}\nApprove: ${item.approveUrl}\nDecline: ${item.declineUrl}`),
    input.extra > 0 ? `And ${input.extra} more on the Operations page.` : '',
    ...(input.notes ?? []),
    emailSenderLine(),
  ].filter(Boolean).join('\n\n')
  return { subject, html, text }
}
