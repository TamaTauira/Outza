'use client'

import { recoverChunkLoadFailure } from '@/lib/chunk-load'

/**
 * Sends a caught page crash to the owner-alert endpoint. Never throws.
 * A chunk or dynamic-import load failure reloads the current URL once and is
 * not reported. It is reported only when that reload still fails.
 */
export function reportCrash(error: Error & { digest?: string }) {
  try {
    const action = recoverChunkLoadFailure(error)
    if (action === 'reload' || action === 'handled') return
    console.error(error)
    const key = process.env.NEXT_PUBLIC_CLIENT_ERROR_TOKEN
    void fetch('/api/alerts/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { 'x-outza-report-key': key } : {}) },
      body: JSON.stringify({ message: error?.message || String(error), stack: error?.stack, digest: error?.digest, path: window.location.pathname }),
      keepalive: true,
    }).catch(() => {})
  } catch {}
}
