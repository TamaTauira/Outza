/**
 * Contact-form caps. Address counts come from stored messages.
 * IP counts stay in this process: a new column would be a production schema change.
 */

export const CONTACT_HOURLY_CAP = 3
export const CONTACT_ACK_WINDOW_MS = 24 * 60 * 60 * 1000
export const CONTACT_HOUR_MS = 60 * 60 * 1000

const ipHits = new Map<string, number[]>()

export function clientIp(req: Request): string {
  const forwarded = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim()
  return forwarded || req.headers.get('x-real-ip')?.trim() || 'unknown'
}

export function turnstileConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!(env.TURNSTILE_SECRET_KEY?.trim() && env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim())
}

/** Siteverify. A missing secret does not call Cloudflare. */
export async function verifyTurnstile(token: string, ip: string, env: Record<string, string | undefined> = process.env): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY?.trim()
  if (!secret) return true
  if (!token.trim()) return false
  const body = new URLSearchParams({ secret, response: token })
  if (ip && ip !== 'unknown') body.set('remoteip', ip)
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body })
    const data = await res.json().catch(() => null) as { success?: boolean } | null
    return !!data?.success
  } catch {
    return false
  }
}

function prune(stamps: number[], now: number, windowMs: number): number[] {
  return stamps.filter((stamp) => now - stamp < windowMs)
}

/** Record an accepted submission for this IP. Returns false when the hourly cap is already full. */
export function takeIpSlot(ip: string, now = Date.now()): boolean {
  const stamps = prune(ipHits.get(ip) ?? [], now, CONTACT_HOUR_MS)
  if (stamps.length >= CONTACT_HOURLY_CAP) {
    ipHits.set(ip, stamps)
    return false
  }
  stamps.push(now)
  ipHits.set(ip, stamps)
  return true
}

export function resetContactIpLimits(): void {
  ipHits.clear()
}

export function contactAddressDecision(input: { inLastHour: number; inLastDay: number }): { allow: boolean; sendAck: boolean } {
  if (input.inLastHour >= CONTACT_HOURLY_CAP) return { allow: false, sendAck: false }
  return { allow: true, sendAck: input.inLastDay < 1 }
}
