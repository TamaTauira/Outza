'use client'

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { isListPage, shouldFinishRestore } from '@/lib/scroll-restore'

// Remembers where people were on a page (and what they had open) so Back
// lands them on the same spot, even when the list renders in afterwards.

const POS_PREFIX = 'outza-scroll:'
const STATE_PREFIX = 'outza-ui:'
const PREV_PREFIX = 'outza-prev:'
const LIST_KEY = 'outza-last-list'
const DEPTH_PREFIX = 'outza-list-depth:'

function initialNavIsHistory() {
  if (typeof window === 'undefined') return false
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return !!nav && (nav.type === 'back_forward' || nav.type === 'reload')
  } catch { return false }
}

let historyNav = initialNavIsHistory()
let installed = false
let restoring = false
let cancelRestore: (() => void) | null = null
let pendingReturn = false
let pendingTarget: number | null = null
let suppressSave = false
const holds = new Set<string>()

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
    if (isListPage(key)) sessionStorage.setItem(LIST_KEY, key)
  } catch {}
}

export function readListDepth(key = typeof window === 'undefined' ? '' : pageKey()): number {
  try {
    const v = Number(sessionStorage.getItem(DEPTH_PREFIX + key))
    return Number.isFinite(v) && v > 1 ? Math.floor(v) : 1
  } catch { return 1 }
}
export function writeListDepth(depth: number, key = pageKey()) {
  try { sessionStorage.setItem(DEPTH_PREFIX + key, String(Math.max(1, Math.floor(depth)))) } catch {}
}

/**
 * Pause settling until a list (or the rails above it) has rendered.
 * Releasing the last hold retries a restore that timed out while the page was still short.
 */
export function holdScrollRestore(id: string) {
  holds.add(id)
  let released = false
  return () => {
    if (released) return
    released = true
    holds.delete(id)
    if (holds.size === 0 && pendingTarget != null && !restoring) restoreTo(pendingTarget)
  }
}

function scrollingElement() {
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

function readY() {
  const el = scrollingElement()
  return Math.max(window.scrollY || 0, el.scrollTop || 0, document.body?.scrollTop || 0)
}

/** Window, documentElement and body. iOS Safari honours different ones after a back swipe. */
function writeY(y: number) {
  const el = scrollingElement()
  try { window.scrollTo(0, y) } catch {}
  el.scrollTop = y
  if (document.body && document.body !== el) document.body.scrollTop = y
}

/**
 * In-app back. If this page was opened from a list (board, local, saved, itinerary, a city
 * landing), this is a real Back so that list's scroll position returns. Otherwise open the
 * last list we were on.
 */
export function returnToEvents(router: { back: () => void; push: (href: string, opts?: { scroll?: boolean }) => void }) {
  let prev: string | null = null
  let target = '/'
  try {
    prev = sessionStorage.getItem(PREV_PREFIX + pageKey())
    target = sessionStorage.getItem(LIST_KEY) || '/'
  } catch {}
  if (prev && isListPage(prev) && window.history.length > 1) {
    router.back()
    return
  }
  pendingReturn = true
  router.push(target, { scroll: false })
}

/** In-app back to a specific list, for example Local from a listing. */
export function returnToPage(router: { back: () => void; push: (href: string, opts?: { scroll?: boolean }) => void }, href: string) {
  let prev: string | null = null
  try { prev = sessionStorage.getItem(PREV_PREFIX + pageKey()) } catch {}
  const path = href.split('?')[0]
  const prevPath = (prev ?? '').split('?')[0]
  if (prev && window.history.length > 1 && (prev === href || prevPath === path)) {
    router.back()
    return
  }
  pendingReturn = true
  router.push(href, { scroll: false })
}

export function isHistoryNav() { return historyNav }

function fontsReady() {
  try { return !document.fonts || document.fonts.status === 'loaded' } catch { return true }
}

function restoreTo(target: number) {
  cancelRestore?.()
  if (!target || target < 1) { pendingTarget = null; return }
  pendingTarget = target
  restoring = true
  const started = performance.now()
  let lastHeight = 0
  let heightChangedAt = started
  let reachedAt = 0
  let frame = 0
  const stop = (commit: boolean) => {
    if (!restoring && commit) return
    restoring = false
    // The scroll event from scrollTo can land after this frame. Don't let it
    // replace a good saved position with the clamped one from a short page.
    suppressSave = true
    window.setTimeout(() => { suppressSave = false }, 200)
    cancelAnimationFrame(frame)
    window.removeEventListener('wheel', onUser, true)
    window.removeEventListener('touchmove', onUser, true)
    cancelRestore = null
    if (commit) {
      pendingTarget = null
      writePos(pageKey(), readY())
    }
  }
  // A back swipe fires touchstart on the page it lands on. Only a real drag or wheel takes over.
  // Ignore those for a moment so the gesture that triggered Back does not cancel the restore.
  const onUser = () => { if (performance.now() - started < 450) return; stop(true) }
  cancelRestore = () => stop(false)
  window.addEventListener('wheel', onUser, { capture: true, passive: true })
  window.addEventListener('touchmove', onUser, { capture: true, passive: true })
  const tick = () => {
    if (!restoring) return
    const now = performance.now()
    const height = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0)
    if (height !== lastHeight) { lastHeight = height; heightChangedAt = now }
    const max = Math.max(0, height - window.innerHeight)
    const y = Math.min(target, max)
    if (Math.abs(readY() - y) > 1) writeY(y)
    if (max >= target - 1 && !reachedAt) reachedAt = now
    if (max < target - 1) reachedAt = 0
    const verdict = shouldFinishRestore({
      target,
      maxScroll: max,
      sinceHeightChange: now - heightChangedAt,
      sinceReached: reachedAt ? now - reachedAt : 0,
      holds: holds.size,
      elapsed: now - started,
      fontsReady: fontsReady(),
    })
    if (verdict === 'done') return stop(true)
    if (verdict === 'timeout') return stop(false)
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
}

export function installScrollMemory() {
  if (installed || typeof window === 'undefined') return
  installed = true
  try { window.history.scrollRestoration = 'manual' } catch {}

  const restoreHere = () => {
    const y = readPos(pageKey())
    if (y !== null && !window.location.hash) restoreTo(y)
  }

  if (historyNav) restoreHere()
  if (isListPage(pageKey())) { try { sessionStorage.setItem(LIST_KEY, pageKey()) } catch {} }

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
    const y = readPos(pageKey())
    cancelRestore?.()
    if (y !== null && !window.location.hash) restoreTo(y)
  })

  // iOS Safari can restore a page from the back-forward cache without a fresh popstate,
  // and the collapsing browser chrome can drop the scroll offset a moment later.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted && !historyNav) return
    historyNav = true
    restoreHere()
  })
  window.visualViewport?.addEventListener('resize', () => {
    if (!restoring || pendingTarget == null) return
    writeY(Math.min(pendingTarget, Math.max(0, scrollingElement().scrollHeight - window.innerHeight)))
  })

  let queued = false
  window.addEventListener('scroll', () => {
    if (restoring || suppressSave || queued) return
    queued = true
    const key = pageKey()
    requestAnimationFrame(() => {
      queued = false
      if (!restoring && key === pageKey()) writePos(key, readY())
    })
  }, { passive: true })
}

export function useBackState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial)
  // 'init' skips the write that would replace a saved value with the default
  // before the restored value has been committed.
  const phase = useRef<'init' | 'live'>('init')
  useEffect(() => {
    if (isHistoryNav()) {
      try {
        const raw = sessionStorage.getItem(STATE_PREFIX + key)
        if (raw !== null) setValue(JSON.parse(raw) as T)
      } catch {}
    }
    phase.current = 'live'
  }, [key])
  useEffect(() => {
    if (phase.current !== 'live') return
    try { sessionStorage.setItem(STATE_PREFIX + key, JSON.stringify(value)) } catch {}
  }, [key, value])
  return [value, setValue]
}
