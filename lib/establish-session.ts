'use client'

import { getSession, signIn } from 'next-auth/react'

/**
 * Credentials sign-in sometimes no-ops on the first call (CSRF cookie not ready yet).
 * Warm the CSRF cookie, then try twice, and only succeed when a session is actually readable.
 */
export async function establishSession(email: string, password: string): Promise<boolean> {
  try { await fetch('/api/auth/csrf') } catch { /* the next sign-in still asks for a token */ }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await signIn('credentials', { email, password, redirect: false })
      if (res && !res.error && res.ok !== false) {
        const session = await getSession()
        if (session?.user) return true
      }
    } catch (err) {
      console.error('Sign-in attempt failed', err)
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 350))
  }
  return false
}
