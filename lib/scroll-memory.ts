'use client'

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

// Remembers where people were on a page (and what they had open) so the browser Back button
// lands them on the exact same spot, even when the page content loads in after navigation.

const POS_PREFIX = 'outza-scroll:'
const STATE_PREFIX = 'outza-ui:'
const PREV_PREFIX = 'outza-prev:' // page key each page was opened from
const LIST_KEY = 'outza-last-list' // last events-board URL (path + query)

const isListKey = (key: string) => key === '/' || key.startsWith('/?') || key === '/map' || key === '/saved'

function initialNavIsHistory() {
  if (typeof window === 'undefined') return false
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return !!nav && (nav.type === 'back_forward' || nav.type === 'reload')
  } catch { return false }
}

// Evaluated when the module loads, i.e. before any component effect reads it.
let historyNav = initialNavIsHistory()
let installed = false
let restoring = false
let cancelRestore: (() => void) | null = null
// Set by returnToEvents() so the next push behaves like Back (restores position + UI state).
let pendingReturn = false

const pageKey = () => window.location.pathname + window.location.search

function readPos(key: string): number | null {
  try {
    const v = sessionStorage.getItem(POS_PREFIX + key)
    return v === null ? null : Number(v)
  } catch { return null }
}
function writePos(key: string, y: number) {
  try {
    sessionStorage.setItem(POS_PREFIX + key, String(Math.round(y)))
    if (isListKey(key)) sessionStorage.setItem(LIST_KEY, key)
  } catch {}
}

/**
 * "Back to events" links: lands on the events board exactly where the user left it.
 * If the previous history entry is the board, this is a real Back; otherwise it opens the
 * last board URL and restores its saved scroll position and filters.
 */
export function returnToEvents(router: { back: () => void; push: (href: string, opts?: { scroll?: boolean }) => void }) {
  let prev: string | null = null
  let target = '/'
  try {
    prev = sessionStorage.getItem(PREV_PREFIX + pageKey())
    target = sessionStorage.getItem(LIST_KEY) || '/'
  } catch {}
  if (prev && isListKey(prev) && window.history.length > 1) {
    router.back()
    return
  }
  pendingReturn = true
  router.push(target, { scroll: false })
}

/** True while the current page was reached with Back/Forward (or a reload). */
export function isHistoryNav() { return historyNav }

function restoreTo(target: number) {
  cancelRestore?.()
  if (!target || target < 1) return
  restoring = true
  const started = performance.now()
  let lastHeight = 0
  let heightChangedAt = started
  let reachedAt = 0
  let frame = 0
  const stop = () => {
    if (!restoring) return
    restoring = false
    cancelAnimationFrame(frame)
    USER_EVENTS.forEach((e) => window.removeEventListener(e, stop, true))
    cancelRestore = null
    writePos(pageKey(), window.scrollY)
  }
  cancelRestore = stop
  // Any deliberate input from the user wins over the restore.
  USER_EVENTS.forEach((e) => window.addEventListener(e, stop, { capture: true, passive: true }))
  const tick = () => {
    if (!restoring) return
    const now = performance.now()
    const height = document.documentElement.scrollHeight
    if (height !== lastHeight) { lastHeight = height; heightChangedAt = now }
    const max = height - window.innerHeight
    const y = Math.min(target, Math.max(0, max))
    if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y)
    if (max >= target - 1 && !reachedAt) reachedAt = now
    const settled = reachedAt && now - heightChangedAt > 700 && now - reachedAt > 400
    if (settled || now - started > 6000) return stop()
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
}

const USER_EVENTS = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const

/** Installs the global listeners once (called from the root providers). */
export function installScrollMemory() {
  if (installed || typeof window === 'undefined') return
  installed = true
  try { window.history.scrollRestoration = 'manual' } catch {}

  if (historyNav) {
    const y = readPos(pageKey())
    if (y !== null && !window.location.hash) restoreTo(y)
  }
  if (isListKey(pageKey())) { try { sessionStorage.setItem(LIST_KEY, pageKey()) } catch {} }

  // Fresh navigations (links, router.push) are not history navigations — unless they come
  // from a "Back to events" link, which should feel exactly like Back.
  const origPush = window.history.pushState
  window.history.pushState = function (...args: Parameters<History['pushState']>) {
    cancelRestore?.()
    const from = pageKey()
    const result = origPush.apply(this, args)
    const to = pageKey()
    if (to !== from) {
      try { sessionStorage.setItem(PREV_PREFIX + to, from) } catch {}
    }
    if (pendingReturn) {
      pendingReturn = false
      historyNav = true
      const y = readPos(to)
      if (y !== null && !window.location.hash) restoreTo(y)
    } else {
      historyNav = false
    }
    return result
  }

  window.addEventListener('popstate', () => {
    historyNav = true
    // Read the saved spot before the outgoing page's scroll events can overwrite it.
    const y = readPos(pageKey())
    cancelRestore?.()
    if (y !== null && !window.location.hash) restoreTo(y)
  })

  let queued = false
  window.addEventListener('scroll', () => {
    if (restoring || queued) return
    queued = true
    const key = pageKey()
    requestAnimationFrame(() => {
      queued = false
      if (!restoring && key === pageKey()) writePos(key, window.scrollY)
    })
  }, { passive: true })
}

/**
 * useState that survives a trip to another page: the value is kept for this browser tab and
 * put back when the user returns with Back, so filters/tabs/expanded sections match what they left.
 */
export function useBackState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial)
  const ready = useRef(false)
  useEffect(() => {
    if (isHistoryNav()) {
      try {
        const raw = sessionStorage.getItem(STATE_PREFIX + key)
        if (raw !== null) setValue(JSON.parse(raw) as T)
      } catch {}
    }
    ready.current = true
  }, [key])
  useEffect(() => {
    if (!ready.current) return
    try { sessionStorage.setItem(STATE_PREFIX + key, JSON.stringify(value)) } catch {}
  }, [key, value])
  return [value, setValue]
}
