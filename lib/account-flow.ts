import { prisma } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { emailBodyCell, emailDocument } from '@/lib/email-brand'
import { siteUrl } from '@/lib/site-url'
import { isQaAccountEmail } from '@/lib/qa-account'
import {
  GENERIC_RESET_MESSAGE,
  VERIFY_GATE_MESSAGE,
  type AuthPurpose,
  accountIsVerified,
  expiresAt,
  hashAuthToken,
  newAuthToken,
  tooManyTokens,
  trialReminderDue,
} from '@/lib/account-trust'

const HOUR_MS = 60 * 60 * 1000

function linkMail(to: string, subject: string, title: string, body: string, href: string, label: string) {
  const home = siteUrl()
  const html = emailDocument({
    title,
    preheader: title,
    manageHref: `${home}/account`,
    homeHref: home,
    reason: 'This message is about your VibePeep account.',
    rows: emailBodyCell(`<p style="margin:0 0 12px;">${body}</p><p style="margin:0;"><a href="${href}">${label}</a></p>`),
  })
  const text = `${title}\n\n${body}\n${href}\n`
  return sendEmail({ to, subject, html, text })
}

async function recentCount(userId: string, purpose: AuthPurpose): Promise<number> {
  return prisma.authToken.count({
    where: { userId, purpose, createdAt: { gt: new Date(Date.now() - HOUR_MS) } },
  })
}

/** Creates a single-use link. Returns null when the hourly cap is already used. */
export async function issueAuthLink(userId: string, email: string, purpose: AuthPurpose, path: string, subject: string, title: string, body: string, label: string) {
  if (isQaAccountEmail(email)) {
    console.error(`[account] not emailing a QA login for ${purpose}`)
    return { sent: false as const, limited: false as const }
  }
  if (tooManyTokens(await recentCount(userId, purpose), purpose)) {
    console.error(`[account] ${purpose} rate limit for user ${userId}`)
    return { sent: false as const, limited: true as const }
  }
  const raw = newAuthToken()
  const row = await prisma.authToken.create({
    data: { userId, purpose, tokenHash: hashAuthToken(raw), expiresAt: expiresAt(purpose) },
  })
  let result: { ok: boolean; disabled?: boolean; error?: string }
  try {
    result = await linkMail(email, subject, title, body, `${siteUrl()}${path}${raw}`, label)
  } catch (err) {
    console.error(`[account] ${purpose} mail threw`, err instanceof Error ? err.message : err)
    result = { ok: false, error: 'send threw' }
  }
  if (!result.ok) {
    console.error(`[account] ${purpose} mail not sent`, result.disabled ? 'email is off' : result.error ?? 'unknown')
    await prisma.authToken.delete({ where: { id: row.id } }).catch(() => {})
    return { sent: false as const, limited: false as const }
  }
  return { sent: true as const, limited: false as const }
}

export async function requestPasswordReset(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase()
  if (!email.includes('@')) return { message: GENERIC_RESET_MESSAGE }
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, password: true } })
  if (user?.password) {
    await issueAuthLink(
      user.id,
      user.email,
      'PASSWORD_RESET',
      '/reset-password?token=',
      'Reset your VibePeep password',
      'Reset your password',
      'Use the link once in the next hour. If you did not ask for this, you can ignore it.',
      'Choose a new password',
    ).catch((err) => {
      console.error('[account] reset failed', err instanceof Error ? err.message : err)
    })
  }
  return { message: GENERIC_RESET_MESSAGE }
}

export async function resetPassword(rawToken: string, nextPassword: string) {
  if (nextPassword.length < 6) return { ok: false as const, status: 400, error: 'Password must be at least 6 characters' }
  const tokenHash = hashAuthToken(rawToken)
  const row = await prisma.authToken.findUnique({ where: { tokenHash } })
  if (!row || row.purpose !== 'PASSWORD_RESET' || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
    return { ok: false as const, status: 400, error: 'That link has expired or already been used.' }
  }
  const bcrypt = await import('bcryptjs')
  const password = await bcrypt.hash(nextPassword, 10)
  const consumed = await prisma.authToken.updateMany({
    where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  })
  if (consumed.count !== 1) return { ok: false as const, status: 400, error: 'That link has expired or already been used.' }
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { password, sessionVersion: { increment: 1 } } }),
    prisma.authToken.updateMany({
      where: { userId: row.userId, purpose: 'PASSWORD_RESET', usedAt: null },
      data: { usedAt: new Date() },
    }),
  ])
  return { ok: true as const }
}

export async function sendVerification(userId: string, email: string) {
  return issueAuthLink(
    userId,
    email,
    'EMAIL_VERIFY',
    '/verify-email?token=',
    'Verify your VibePeep email',
    'Verify your email',
    'Open the link in the next day to publish events and use organiser tools. Browsing and saving work either way.',
    'Verify email',
  )
}

export async function verifyEmail(rawToken: string) {
  const tokenHash = hashAuthToken(rawToken)
  const row = await prisma.authToken.findUnique({ where: { tokenHash } })
  if (!row || row.purpose !== 'EMAIL_VERIFY' || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
    return { ok: false as const, status: 400, error: 'That link has expired or already been used.' }
  }
  const consumed = await prisma.authToken.updateMany({
    where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  })
  if (consumed.count !== 1) return { ok: false as const, status: 400, error: 'That link has expired or already been used.' }
  await prisma.user.update({ where: { id: row.userId }, data: { emailVerified: new Date() } })
  return { ok: true as const }
}

export async function resendVerification(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } })
  if (!user) return { ok: false as const, status: 401, error: 'Please sign in to do that.' }
  if (accountIsVerified(user.emailVerified)) return { ok: true as const, already: true as const }
  const sent = await sendVerification(userId, user.email)
  return { ok: true as const, sent: sent.sent, limited: sent.limited }
}

export async function unverifiedGate(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true } })
  if (accountIsVerified(user?.emailVerified)) return null
  return { status: 403 as const, error: VERIFY_GATE_MESSAGE }
}

export async function runTrialReminders() {
  const now = new Date()
  const horizon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  const rows = await prisma.organiserSubscription.findMany({
    where: {
      status: 'TRIALING',
      trialRemindedAt: null,
      currentPeriodEnd: { gt: now, lte: horizon },
    },
    include: { user: { select: { email: true, name: true } }, plan: { select: { name: true } } },
    take: 50,
  })
  let sent = 0
  let skipped = 0
  for (const row of rows) {
    if (!row.currentPeriodEnd || !trialReminderDue(row.currentPeriodEnd, now)) { skipped++; continue }
    if (isQaAccountEmail(row.user.email)) { skipped++; continue }
    const when = row.currentPeriodEnd.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Sydney' })
    try {
      const result = await linkMail(
        row.user.email,
        'Your VibePeep free month is ending',
        'Your free month is ending',
        `The free month on ${row.plan.name} ends on ${when}. Cancel before then from Promoter billing if you do not want the monthly charge.`,
        `${siteUrl()}/promoter?tab=billing`,
        'Open billing',
      )
      if (!result.ok) {
        console.error('[trial] reminder not sent', result.disabled ? 'email is off' : result.error ?? 'unknown')
        skipped++
        continue
      }
      await prisma.organiserSubscription.update({ where: { id: row.id }, data: { trialRemindedAt: now } })
      sent++
    } catch (err) {
      console.error('[trial] reminder failed', err instanceof Error ? err.message : err)
      skipped++
    }
  }
  return { checked: rows.length, sent, skipped }
}
