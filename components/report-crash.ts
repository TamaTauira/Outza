'use client'

/** Sends a caught page crash to the owner-alert endpoint. Never throws. */
export function reportCrash(error: Error & { digest?: string }) {
  try {
    console.error(error)
    void fetch('/api/alerts/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: error?.message || String(error), stack: error?.stack, digest: error?.digest, path: window.location.pathname }),
      keepalive: true,
    }).catch(() => {})
  } catch {}
}
