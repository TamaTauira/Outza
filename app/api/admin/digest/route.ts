import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorized, forbidden } from '@/lib/session'
import { emailSendingEnabled, isResendTestSender, publicEmailError, redactEmails } from '@/lib/email'
import { sendDigest } from '@/lib/digest'
import { sendWatchDigest } from '@/lib/watch-mail'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

async function admin() {
  const me = await getSessionUser()
  if (!me) return { err: unauthorized() }
  if (me.role !== 'ADMIN') return { err: forbidden() }
  return { me }
}

const TEST_SENDER_BLOCKER = 'Mail is still sent from Resend’s onboarding address. That sender can only deliver to the Resend account owner. Other recipients fail with HTTP 403 until a domain is verified in Resend and RESEND_FROM_EMAIL is an address on that domain.'

function outcome(result: { ok: boolean; error?: string; skipped?: boolean; blocked?: boolean; disabled?: boolean; restricted?: boolean }) {
  if (result.ok) return { ok: true as const }
  const restricted = !!result.restricted
  const error = result.blocked || result.skipped
    ? (result.error ?? 'Nothing to send')
    : publicEmailError(result.error)
  return { ok: false as const, error, restricted, disabled: !!result.disabled }
}

/** Last digest and watchlist delivery rows, plus whether the From address is still the Resend test sender. */
export async function GET() {
  const g = await admin()
  if (g.err) return g.err
  const [deliveries, newsletter] = await Promise.all([
    prisma.mailDelivery.findMany({
      where: { kind: { not: 'quota' } },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { kind: true, status: true, error: true, createdAt: true },
    }).catch(() => []),
    prisma.newsletterSend.findMany({
      orderBy: { sentAt: 'desc' },
      take: 5,
      select: { status: true, error: true, sentAt: true, edition: true },
    }),
  ])
  return NextResponse.json({
    sendingEnabled: emailSendingEnabled(),
    testSender: isResendTestSender(),
    blocker: isResendTestSender() ? TEST_SENDER_BLOCKER : null,
    deliveries: deliveries.map((row) => ({ ...row, error: row.error ? redactEmails(row.error) : null })),
    newsletter: newsletter.map((row) => ({ ...row, error: row.error ? redactEmails(row.error) : null })),
  })
}

/** Sends a watchlist digest and a newsletter digest built from the signed-in admin's own signals. Does not move their schedule. */
export async function POST() {
  const g = await admin()
  if (g.err) return g.err
  try {
    const [watchlist, newsletter] = await Promise.all([
      sendWatchDigest(g.me!.id, { test: true }),
      sendDigest(g.me!.id, { test: true }),
    ])
    const watch = outcome(watchlist)
    const news = outcome(newsletter)
    const ok = watch.ok && news.ok
    return NextResponse.json({ ok, to: g.me!.email, watchlist: watch, newsletter: news }, { status: ok ? 200 : 422 })
  } catch (err) {
    console.error('[admin/digest]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Test digest failed' }, { status: 500 })
  }
}
