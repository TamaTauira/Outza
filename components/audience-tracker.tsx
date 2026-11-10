'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { searchKey, sydneyDay } from '@/lib/metric-public'

const SKIP = ['/admin', '/promoter', '/login', '/signup', '/reset-password']

function skipped(path: string) {
  return SKIP.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

function rememberSearch(query: string) {
  const key = searchKey(query)
  if (!key) return
  const day = sydneyDay()
  const slot = `vp-q-${day}-${key}`
  try {
    if (sessionStorage.getItem(slot)) return
    sessionStorage.setItem(slot, '1')
    sessionStorage.setItem('vp-search-live', day)
    sessionStorage.setItem('vp-search-at', String(Date.now()))
  } catch {
    return
  }
  const body = JSON.stringify({ h: key })
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/analytics/search', new Blob([body], { type: 'application/json' }))
    return
  }
  void fetch('/api/analytics/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {})
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url
  return ''
}

function observeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = urlOf(input)
  if (!url || url.includes('/api/analytics')) return
  try {
    if (url.includes('/api/events')) {
      const query = new URL(url, window.location.origin).searchParams.get('search') ?? ''
      rememberSearch(query)
      return
    }
    if (url.includes('/api/ai-search') && typeof init?.body === 'string') {
      const parsed = JSON.parse(init.body) as { q?: unknown }
      if (typeof parsed.q === 'string') rememberSearch(parsed.q)
    }
  } catch {
    // A bad URL or body must not break the request it was riding on.
  }
}

function onResultClick(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element)) return
  const link = target.closest('a[href]')
  if (!link) return
  const href = link.getAttribute('href') ?? ''
  if (!href.includes('/events/')) return
  let live = ''
  let at = 0
  try {
    live = sessionStorage.getItem('vp-search-live') ?? ''
    at = Number(sessionStorage.getItem('vp-search-at') ?? 0)
  } catch { return }
  if (!live || live !== sydneyDay() || !at || Date.now() - at > 30 * 60 * 1000) return
  const fromAsk = link.classList.contains('ring-white/5')
  const fromMap = !!link.closest('.se-pop')
  if (!fromAsk && !fromMap) return
  navigator.sendBeacon?.('/api/analytics/discovery-click')
}

/**
 * First-party audience and search notes. No third-party script.
 * One anonymous id per browser, stored as a presence day, not a profile.
 */
export function AudienceTracker() {
  const pathname = usePathname()

  useEffect(() => {
    const original = window.fetch.bind(window)
    const wrapped: typeof window.fetch = (input, init) => {
      observeFetch(input, init)
      return original(input, init)
    }
    window.fetch = wrapped
    document.addEventListener('click', onResultClick, true)
    return () => {
      document.removeEventListener('click', onResultClick, true)
      if (window.fetch === wrapped) window.fetch = original
    }
  }, [])

  useEffect(() => {
    const path = pathname || '/'
    if (skipped(path)) return
    const day = sydneyDay()
    const key = `vp-day-${day}`
    try { if (sessionStorage.getItem(key)) return } catch { /* still try the request */ }
    void fetch('/api/analytics/visit', { method: 'POST', keepalive: true })
      .then((res) => {
        if (!res.ok) return
        try { sessionStorage.setItem(key, '1') } catch { /* the cookie still counts */ }
      })
      .catch(() => {})
  }, [pathname])

  return null
}
