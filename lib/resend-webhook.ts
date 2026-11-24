import { createHmac, timingSafeEqual } from 'crypto'

const SEND_ID = /^[a-z0-9]{8,40}$/i

export function verifyResendWebhook(
  body: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  now = Date.now(),
): boolean {
  const { id, timestamp, signature } = headers
  if (!id || !timestamp || !signature || !secret) return false
  let ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  if (ts > 1e12) ts = ts / 1000
  if (Math.abs(now / 1000 - ts) > 5 * 60) return false
  const keys = secret.startsWith('whsec_')
    ? [Buffer.from(secret.slice('whsec_'.length), 'base64'), Buffer.from(secret), Buffer.from(secret.slice('whsec_'.length))]
    : [Buffer.from(secret)]
  return keys.some((key) => {
    if (!key.length) return false
    const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')
    const a = Buffer.from(expected)
    return signature.split(' ').some((part) => {
      const [version, sig] = part.split(',')
      if (version !== 'v1' || !sig) return false
      const b = Buffer.from(sig)
      return a.length === b.length && timingSafeEqual(a, b)
    })
  })
}

export type ResendNotice =
  | { kind: 'open' | 'click'; sendId: string | null; emailId: string | null }
  | { kind: 'bounce' | 'complaint'; email: string | null; emailId: string | null }

function tagValue(tags: unknown, name: string): string | null {
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (!tag || typeof tag !== 'object') continue
      if ((tag as { name?: unknown }).name !== name) continue
      const value = (tag as { value?: unknown }).value
      if (typeof value === 'string' && SEND_ID.test(value)) return value
    }
    return null
  }
  if (tags && typeof tags === 'object') {
    const value = (tags as Record<string, unknown>)[name]
    if (typeof value === 'string' && SEND_ID.test(value)) return value
  }
  return null
}

function emailIdOf(data: object): string | null {
  const rawId = (data as { email_id?: unknown }).email_id
  return typeof rawId === 'string' && /^[A-Za-z0-9_-]{4,80}$/.test(rawId) ? rawId : null
}

function firstEmail(data: object): string | null {
  const to = (data as { to?: unknown }).to
  const raw = Array.isArray(to) ? to.find((item) => typeof item === 'string') : to
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

/** Opens, clicks, bounces and complaints. Other event types are ignored. */
export function readResendNotice(payload: unknown): ResendNotice | null {
  if (!payload || typeof payload !== 'object') return null
  const type = (payload as { type?: unknown }).type
  const data = (payload as { data?: unknown }).data
  const record = data && typeof data === 'object' ? data as object : null
  if (type === 'email.bounced' || type === 'email.complained') {
    return {
      kind: type === 'email.bounced' ? 'bounce' : 'complaint',
      email: record ? firstEmail(record) : null,
      emailId: record ? emailIdOf(record) : null,
    }
  }
  const kind = type === 'email.opened' ? 'open' : type === 'email.clicked' ? 'click' : null
  if (!kind) return null
  if (!record) return { kind, sendId: null, emailId: null }
  return { kind, sendId: tagValue((record as { tags?: unknown }).tags, 'send_id'), emailId: emailIdOf(record) }
}

export function resendEventId(id: string | null): string | null {
  if (!id || !/^[A-Za-z0-9_.-]{8,100}$/.test(id)) return null
  return id
}
