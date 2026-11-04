import { createHash, randomBytes } from 'crypto'

/** Password-reset links last about an hour. */
export const RESET_TTL_MS = 60 * 60 * 1000
/** Email-verification links last about a day. */
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000
export const RESET_MAX_PER_HOUR = 3
export const VERIFY_MAX_PER_HOUR = 3

export const GENERIC_RESET_MESSAGE = 'If an account exists for that email, a reset link is on its way. The link works once and expires in about an hour.'
export const VERIFY_GATE_MESSAGE = 'Verify your email before you publish or pay. You can still browse and save.'

export type AuthPurpose = 'PASSWORD_RESET' | 'EMAIL_VERIFY'

export function authTokenPepper(env: Record<string, string | undefined> = process.env): string {
  return env.AUTH_SECRET?.trim() || env.NEXTAUTH_SECRET?.trim() || 'vibepeep-auth-token'
}

export function hashAuthToken(raw: string, pepper = authTokenPepper()): string {
  return createHash('sha256').update(`${pepper}:${raw}`).digest('hex')
}

export function newAuthToken(): string {
  return randomBytes(32).toString('base64url')
}

export function expiresAt(purpose: AuthPurpose, now = Date.now()): Date {
  return new Date(now + (purpose === 'PASSWORD_RESET' ? RESET_TTL_MS : VERIFY_TTL_MS))
}

export function tooManyTokens(recentCount: number, purpose: AuthPurpose): boolean {
  const max = purpose === 'PASSWORD_RESET' ? RESET_MAX_PER_HOUR : VERIFY_MAX_PER_HOUR
  return recentCount >= max
}

export function accountIsVerified(emailVerified: Date | null | undefined): boolean {
  return emailVerified instanceof Date && !Number.isNaN(emailVerified.getTime())
}

/** One calendar month. Override with TRIAL_PERIOD_DAYS (1–90). */
export const DEFAULT_TRIAL_DAYS = 30

export function trialPeriodDays(env: Record<string, string | undefined> = process.env): number {
  const raw = env.TRIAL_PERIOD_DAYS?.trim()
  if (!raw) return DEFAULT_TRIAL_DAYS
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > 90) return DEFAULT_TRIAL_DAYS
  return n
}

export function trialEligible(trialUsedAt: Date | null | undefined): boolean {
  return !trialUsedAt
}

export function trialAccess(input: {
  stripeConfigured: boolean
  status: string | null | undefined
  periodEnd: Date | null | undefined
  now?: Date
}): boolean {
  if (!input.stripeConfigured) return false
  if (input.status !== 'TRIALING' && input.status !== 'ACTIVE') return false
  if (input.periodEnd && input.periodEnd.getTime() <= (input.now ?? new Date()).getTime()) return false
  return true
}

/** True in the three days before a trial ends, and not after it has ended. */
export function trialReminderDue(periodEnd: Date, now = new Date(), leadDays = 3): boolean {
  const ms = periodEnd.getTime() - now.getTime()
  return ms > 0 && ms <= leadDays * 24 * 60 * 60 * 1000
}

export function trialConsentCopy(days: number, eligible: boolean): string {
  if (!eligible) {
    return 'This account has already used its free month. The plan price is charged today in AUD, then the same amount each month until you cancel.'
  }
  return `The first ${days} days are free. After that the plan price is charged in AUD, then the same amount each month until you cancel. Cancel before the free month ends and you will not be charged.`
}
