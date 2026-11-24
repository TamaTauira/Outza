import { createHmac, randomBytes, timingSafeEqual, createHash } from 'crypto'
import { DIGEST_TOKEN_MS } from '@/lib/ops/types'

export type DigestAction = 'approve' | 'decline'

export type DigestPayload = {
  itemId: string
  action: DigestAction
  exp: number
  nonce: string
}

function secret(): string {
  const dedicated = process.env.OPS_DIGEST_SECRET?.trim()
  if (dedicated) return dedicated
  const cron = process.env.CRON_SECRET?.trim()
  if (cron) return cron
  return ''
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url')
}

export function digestTokenSecretConfigured(): boolean {
  return secret().length >= 16
}

export function signDigestToken(payload: DigestPayload, key = secret()): string {
  if (key.length < 16) throw new Error('OPS_DIGEST_SECRET or CRON_SECRET must be at least 16 characters')
  const body = b64url(Buffer.from(JSON.stringify(payload)))
  const sig = b64url(createHmac('sha256', key).update(body).digest())
  return `${body}.${sig}`
}

export function newDigestToken(itemId: string, action: DigestAction, now = Date.now(), key?: string): { token: string; payload: DigestPayload } {
  const payload: DigestPayload = {
    itemId,
    action,
    exp: now + DIGEST_TOKEN_MS,
    nonce: randomBytes(16).toString('hex'),
  }
  return { token: signDigestToken(payload, key), payload }
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export type TokenCheck =
  | { ok: true; payload: DigestPayload }
  | { ok: false; reason: 'invalid' | 'expired' | 'unconfigured' }

/** Signature and expiry only. Single use is the stored nonce. */
export function verifyDigestToken(token: string, now = Date.now(), key = secret()): TokenCheck {
  if (key.length < 16) return { ok: false, reason: 'unconfigured' }
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'invalid' }
  const expected = createHmac('sha256', key).update(parts[0]).digest()
  let got: Buffer
  try { got = Buffer.from(parts[1], 'base64url') } catch { return { ok: false, reason: 'invalid' } }
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return { ok: false, reason: 'invalid' }
  let payload: DigestPayload
  try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as DigestPayload } catch { return { ok: false, reason: 'invalid' } }
  if (!payload || (payload.action !== 'approve' && payload.action !== 'decline')) return { ok: false, reason: 'invalid' }
  if (typeof payload.itemId !== 'string' || !payload.itemId || typeof payload.nonce !== 'string' || payload.nonce.length < 8) return { ok: false, reason: 'invalid' }
  if (!Number.isFinite(payload.exp) || payload.exp < now) return { ok: false, reason: 'expired' }
  return { ok: true, payload }
}
