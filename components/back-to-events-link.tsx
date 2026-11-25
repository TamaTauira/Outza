'use client'

import type { MouseEvent, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { returnToPage } from '@/lib/scroll-memory'

const PREV_PREFIX = 'outza-prev:'

/**
 * Back when this tab actually came from the site. A direct, shared or emailed
 * link has nothing to go back to, so it opens home instead of a no-op history.back().
 */
export function BackToEventsLink({ className, children }: { className?: string; children: ReactNode }) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    let prev = ''
    try { prev = sessionStorage.getItem(PREV_PREFIX + window.location.pathname + window.location.search) ?? '' } catch { /* still go home */ }
    const fromHere = document.referrer.startsWith(window.location.origin)
    const before = window.location.href
    if (prev.startsWith('/') && fromHere && window.history.length > 1) {
      window.history.back()
      window.setTimeout(() => {
        if (window.location.href === before) window.location.assign('/')
      }, 400)
      return
    }
    window.location.assign('/')
  }
  return <a href="/" onClick={onClick} className={className}>{children}</a>
}

/** Back to a specific list (Local, a venue, a city guide) at the scroll position the reader left. */
export function BackLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter()
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    returnToPage(router, href)
  }
  return <a href={href} onClick={onClick} className={className}>{children}</a>
}
