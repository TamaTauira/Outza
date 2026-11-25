import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The one header row. 16px gutter on phones (the content gutter), 24px from sm.
 * The bar is a fixed height so the lockup sits on the centre line.
 */
export function SiteHeaderFrame({ children, grow = false }: { children: ReactNode; grow?: boolean }) {
  return (
    <>
      <header className={cn('vp-site-header vp-header-fixed fixed inset-x-0 top-0 z-50 bg-background/90 backdrop-blur-md', grow && 'vp-header-grow')}>
        <div className={cn(
          'vp-header-bar vp-wrap flex min-w-0 items-center gap-1 border-b border-border px-4 sm:px-6',
          grow ? 'h-auto min-h-14 flex-wrap gap-y-2 py-2 sm:min-h-16' : 'h-14 sm:h-16',
        )}>
          {children}
        </div>
      </header>
      <div className={cn('vp-header-spacer', grow ? 'min-h-14 sm:min-h-16' : 'h-14 sm:h-16')} aria-hidden />
    </>
  )
}
