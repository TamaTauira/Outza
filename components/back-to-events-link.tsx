'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { MouseEvent, ReactNode } from 'react'
import { returnToEvents } from '@/lib/scroll-memory'

/** "Back to events" link that returns to the board at the exact scroll spot (and filters) the user left. */
export function BackToEventsLink({ className, children }: { className?: string; children: ReactNode }) {
  const router = useRouter()
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    returnToEvents(router)
  }
  return <Link href="/" scroll={false} onClick={onClick} className={className}>{children}</Link>
}
