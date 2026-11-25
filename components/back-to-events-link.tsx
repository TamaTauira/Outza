'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { MouseEvent, ReactNode } from 'react'
import { returnToPage } from '@/lib/scroll-memory'

/** Plain link home. A prevented click plus history.back() was leaving people on the same page. */
export function BackToEventsLink({ className, children }: { className?: string; children: ReactNode }) {
  return <Link href="/" className={className}>{children}</Link>
}

/** Back to a specific list (Local, a venue, a city guide) at the scroll position the reader left. */
export function BackLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter()
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    returnToPage(router, href)
  }
  return <Link href={href} scroll={false} onClick={onClick} className={className}>{children}</Link>
}
