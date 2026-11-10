import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { readResendNotice, resendEventId, verifyResendWebhook } from '@/lib/resend-webhook'

export const dynamic = 'force-dynamic'

/**
 * Resend open and click webhooks. They update the same edition rows the
 * tracking image and link redirects already use, so a retry cannot double-count
 * an open, and a click still counts as one person per edition.
 */
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim() ?? ''
  if (!secret) return NextResponse.json({ error: 'Resend webhook is not configured' }, { status: 503 })
  const body = await req.text()
  const id = resendEventId(req.headers.get('svix-id'))
  const ok = verifyResendWebhook(body, {
    id,
    timestamp: req.headers.get('svix-timestamp'),
    signature: req.headers.get('svix-signature'),
  }, secret)
  if (!ok || !id) return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })

  try {
    await prisma.emailWebhookEvent.create({ data: { id } })
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return NextResponse.json({ ok: true })
    console.error('[resend] webhook', (err as Error).message)
    return NextResponse.json({ error: 'Not stored' }, { status: 500 })
  }

  let payload: unknown
  try { payload = JSON.parse(body) } catch { return NextResponse.json({ ok: true }) }
  const notice = readResendNotice(payload)
  if (!notice || (!notice.sendId && !notice.emailId)) return NextResponse.json({ ok: true })

  const send = await prisma.newsletterSend.findFirst({
    where: {
      status: 'SENT',
      OR: [
        ...(notice.sendId ? [{ id: notice.sendId }] : []),
        ...(notice.emailId ? [{ resendId: notice.emailId }] : []),
      ],
    },
    select: { id: true },
  }).catch(() => null)
  if (!send) return NextResponse.json({ ok: true })

  if (notice.kind === 'open') {
    await prisma.newsletterSend.updateMany({
      where: { id: send.id, openedAt: null },
      data: { openedAt: new Date() },
    }).catch(() => {})
  } else {
    await prisma.newsletterClick.create({
      data: { sendId: send.id, placement: 'resend', target: 'detail' },
    }).catch(() => {})
  }
  return NextResponse.json({ ok: true })
}
