import { NextResponse } from 'next/server'
import { getSessionUser, unauthorized, forbidden } from '@/lib/session'
import { sendEmail, publicEmailError } from '@/lib/email'
import { renderTemplate, catalogueEntry, type TemplateId, CATALOGUE_IDS } from '@/lib/email-catalogue'
import { assertTestInbox } from '@/lib/email-test-inbox'
import { recordMailDelivery } from '@/lib/mail-log'
import { siteUrl } from '@/lib/site-url'

export const dynamic = 'force-dynamic'

/** Sends one catalogue preview. The recipient must be EMAIL_TEST_INBOX. */
export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (me.role !== 'ADMIN') return forbidden()
  const body = await req.json().catch(() => ({}))
  const id = String(body.id || '')
  if (!CATALOGUE_IDS.includes(id as TemplateId)) return NextResponse.json({ error: 'Unknown template' }, { status: 404 })
  const allowed = assertTestInbox(String(body.to || ''))
  if (!allowed.ok) return NextResponse.json({ error: allowed.error }, { status: 400 })
  const row = catalogueEntry(id)
  const mail = renderTemplate(id as TemplateId)
  const result = await sendEmail({
    to: allowed.to,
    subject: `[test] ${mail.subject}`.slice(0, 120),
    html: mail.html,
    text: mail.text,
    kind: row?.kind ?? 'transactional',
    ...(row && row.kind !== 'transactional' ? { unsubscribeUrl: `${siteUrl()}/unsubscribe` } : {}),
  })
  await recordMailDelivery({
    kind: `template-test-${id}`,
    userId: me.id,
    status: result.ok ? 'test' : 'failed',
    error: result.ok ? null : result.error,
  })
  if (!result.ok) return NextResponse.json({ error: publicEmailError(result.error) }, { status: result.disabled ? 503 : 502 })
  return NextResponse.json({ ok: true, to: allowed.to })
}
