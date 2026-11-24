/**
 * Draft replies for contact triage. None are approved, so nothing here can auto-send.
 * Tama approves a template by setting approvedByOwnerAt. Until then the draft stays on the row.
 */
export type ReplyTemplate = {
  id: string
  purpose: string
  subject: string
  body: string
  /** ISO date once Tama has approved this wording for automatic sending. Null means draft only. */
  approvedByOwnerAt: string | null
}

export const REPLY_TEMPLATES: ReplyTemplate[] = [
  {
    id: 'faq-account',
    purpose: 'Account and sign-in questions',
    subject: 'Signing in to VibePeep',
    body: 'You can reset a password from the forgot-password page. Browsing and saving work before an email is confirmed. Organiser tools wait until the confirm link is used.',
    approvedByOwnerAt: null,
  },
  {
    id: 'faq-list-event',
    purpose: 'How to list an event',
    subject: 'Listing something on VibePeep',
    body: 'Open VibePeep Local, send the listing, and confirm the code we email. The address on that form stays off the public page.',
    approvedByOwnerAt: null,
  },
  {
    id: 'ack-escalation',
    purpose: 'We received a note that needs a person',
    subject: 'We’ve got your note',
    body: 'Thanks for writing. If it needs a closer look, we’ll be in touch within 2 business days.',
    approvedByOwnerAt: null,
  },
  {
    id: 'thanks-suggestion',
    purpose: 'Suggestion acknowledgement',
    subject: 'Thanks — we read every idea',
    body: 'Thanks for the idea. We read these in a monthly bundle. That isn’t a promise to build it.',
    approvedByOwnerAt: null,
  },
  {
    id: 'thanks-report',
    purpose: 'Listing report acknowledgement',
    subject: 'Thanks for the heads-up',
    body: 'Thanks for flagging that listing. We’ll check it. This note doesn’t promise a particular outcome.',
    approvedByOwnerAt: null,
  },
]

export function approvedReplyTemplate(id: string, now = Date.now()): ReplyTemplate | null {
  const row = REPLY_TEMPLATES.find((item) => item.id === id)
  if (!row?.approvedByOwnerAt) return null
  const at = Date.parse(row.approvedByOwnerAt)
  if (!Number.isFinite(at) || at > now) return null
  return row
}
