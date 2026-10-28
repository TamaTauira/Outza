'use client'

/** Sends a caught page crash to the owner-alert endpoint. Never throws. */
export function reportCrash(error: Error & { digest?: string }) {
  try {
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
