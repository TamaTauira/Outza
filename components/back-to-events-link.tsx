'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { forwardRef, type ComponentPropsWithoutRef, type MouseEvent, type ReactNode } from 'react'
import { returnToEvents } from '@/lib/scroll-memory'

type Props = Omit<ComponentPropsWithoutRef<typeof Link>, 'href'> & { children: ReactNode }

/** "Back to events" link that returns to the board at the exact scroll spot (and filters) the user left. */
export const BackToEventsLink = forwardRef<HTMLAnchorElement, Props>(function BackToEventsLink({ className, children, onClick, ...rest }, ref) {
  const router = useRouter()
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    returnToEvents(router)
  }
  return <Link ref={ref} href="/" scroll={false} onClick={handle} className={className} {...rest}>{children}</Link>
})
