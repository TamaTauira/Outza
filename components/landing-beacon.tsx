'use client'

import { useEffect } from 'react'

function post(body: Record<string, string | undefined>) {
  fetch('/api/landing/hit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {})
}

/** One view per tab for this guide. Stores the inbound referrer for the next click. */
export function LandingViewBeacon({ path }: { path: string }) {
  useEffect(() => {
    const key = `vp-v:${path}`
    let referrer = ''
    try {
      referrer = document.referrer.slice(0, 500)
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
      if (referrer) sessionStorage.setItem('vp-ref', referrer)
    } catch { /* private mode still counts */ }
    const params = new URLSearchParams(window.location.search)
    post({
      kind: 'view',
      path,
      referrer,
      utmSource: params.get('utm_source') ?? undefined,
      utmMedium: params.get('utm_medium') ?? undefined,
    })
  }, [path])
  return null
}

/** Event detail opened from a guide (`?lp=`). Referrer prefers the guide's inbound visit. */
export function LandingDetailBeacon() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const path = params.get('lp')
    if (!path) return
    const key = `vp-d:${path}:${window.location.pathname}`
    let referrer = ''
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
      referrer = sessionStorage.getItem('vp-ref') || document.referrer
    } catch {
      referrer = document.referrer
    }
    post({
      kind: 'detail',
      path,
      referrer: referrer.slice(0, 500),
      utmSource: params.get('utm_source') ?? undefined,
      utmMedium: params.get('utm_medium') ?? undefined,
    })
  }, [])
  return null
}
