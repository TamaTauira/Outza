import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'

export const GUEST_COOKIE = 'outza_guest'

export function validGuestKey(value: string | undefined | null): value is string {
  return !!value && /^[a-f0-9]{32}$/.test(value)
}

export async function readGuestKey(): Promise<string | null> {
  const jar = await cookies()
  const value = jar.get(GUEST_COOKIE)?.value
  return validGuestKey(value) ? value : null
}

/** Sets a guest cookie when this browser does not have one yet. Call from a route handler. */
export async function ensureGuestKey(): Promise<string> {
  const existing = await readGuestKey()
  if (existing) return existing
  const key = randomBytes(16).toString('hex')
  const jar = await cookies()
  jar.set(GUEST_COOKIE, key, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 400,
    secure: process.env.NODE_ENV === 'production',
  })
  return key
}
