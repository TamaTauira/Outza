import { createHash } from 'crypto'

/** Same rules as the community hub code: hashed secret, 30 minutes, five tries, single use. */
export const CODE_MINUTES = 30
export const CODE_ATTEMPTS = 5

export function hashVerificationSecret(value: string, pepper: string): string {
  return createHash('sha256').update(`${pepper}:${value}`).digest('hex')
}

export function assessCode(
  row: { codeHash: string; tokenHash: string; expiresAt: Date | string; usedAt?: Date | string | null; attempts: number } | null,
  input: { code?: string | null; token?: string | null; pepper: string },
  now = new Date(),
): 'ok' | 'missing' | 'expired' | 'used' | 'locked' | 'mismatch' {
  if (!row) return 'missing'
  if (row.usedAt) return 'used'
  if (new Date(row.expiresAt).getTime() <= now.getTime()) return 'expired'
  if (row.attempts >= CODE_ATTEMPTS) return 'locked'
  if (input.token) return hashVerificationSecret(input.token, input.pepper) === row.tokenHash ? 'ok' : 'mismatch'
  if (!input.code) return 'mismatch'
  return hashVerificationSecret(input.code, input.pepper) === row.codeHash ? 'ok' : 'mismatch'
}
