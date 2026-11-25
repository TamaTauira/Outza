import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const LOOK = {
  hero: 'vp-hero-title font-display font-extrabold tracking-tight',
  page: 'font-display text-h1',
  section: 'vp-h2 font-display',
} as const

/** One heading scale. Hero pages, plain pages and section titles share it. */
export function PageHeading({
  as,
  variant = 'page',
  className,
  children,
}: {
  as?: 'h1' | 'h2' | 'h3'
  variant?: keyof typeof LOOK
  className?: string
  children: ReactNode
}) {
  const Tag = as ?? (variant === 'section' ? 'h2' : 'h1')
  return <Tag className={cn(LOOK[variant], className)}>{children}</Tag>
}
