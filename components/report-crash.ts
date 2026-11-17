'use client'

import { recoverChunkLoadFailure } from '@/lib/chunk-load'
import { isBareNetworkFault } from '@/lib/network-fault'

const SESSION_KEY = 'vp-fault-session'

function faultSession(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY)
    if (existing && /^[A-Za-z0-9_-]{8,80}$/.test(existing)) return existing
    const raw = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
    const next = raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80)
    if (next.length < 8) return ''
    sessionStorage.setItem(SESSION_KEY, next)
    return next
  } catch {
    return ''
  }
}

/**
 * Sends a caught page crash to the owner-alert endpoint. Never throws.
 * A chunk or dynamic-import load failure reloads the current URL once and is
 * not reported. It is reported only when that reload still fails.
 * A stackless fetch failure ("Load failed" and the other browser wordings) is
 * still posted so it can be counted, and the server does not email it as a
 * page crash unless many sessions hit it at once.
 */
export function reportCrash(error: Error & { digest?: string }) {
  try {
    const action = recoverChunkLoadFailure(error)
    if (action === 'reload' || action === 'handled') return
    const transient = isBareNetworkFault(error)
    if (!transient) console.error(error)
    const key = process.env.NEXT_PUBLIC_CLIENT_ERROR_TOKEN
    const session = faultSession()
    void fetch('/api/alerts/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { 'x-outza-report-key': key } : {}) },
      body: JSON.stringify({
        message: error?.message || String(error),
        name: error?.name,
        stack: error?.stack,
        digest: error?.digest,
        path: window.location.pathname,
        ...(session ? { session } : {}),
      }),
      keepalive: true,
    }).catch(() => {})
  } catch {}
}
