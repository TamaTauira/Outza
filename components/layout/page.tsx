import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const WIDTH = {
  full: 'vp-wrap',
  prose: 'vp-wrap max-w-[var(--vp-container-prose)]',
  narrow: 'mx-auto w-full max-w-xl',
} as const

/** Page gutters. Every page lines up with the header at sm and above. */
export function Page({
  width = 'full',
  className,
  children,
}: {
  width?: keyof typeof WIDTH
  className?: string
  children: ReactNode
}) {
  return <div className={cn(WIDTH[width], 'vp-page-top px-4 sm:px-6', className)}>{children}</div>
}
