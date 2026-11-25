import type { ReactNode } from 'react'
import { VibePeepLogo } from '@/components/vibepeep-logo'
import { cn } from '@/lib/utils'

/** The one header row. Pages share this bar so the logo and the padding stay the same. */
export function SiteHeaderFrame({ children, grow = false }: { children: ReactNode; grow?: boolean }) {
  return (
    <header className="vp-site-header sticky top-0 z-50 bg-background/90 backdrop-blur-md">
      <div className={cn(
        'vp-header-bar vp-wrap min-w-0 border-b border-border px-2 sm:px-6 flex items-center gap-1',
        grow ? 'h-auto min-h-14 flex-wrap gap-y-2 py-2 sm:min-h-16' : 'h-14 sm:h-16',
      )}>
        {children}
      </div>
    </header>
  )
}

export function SiteHeaderBrand() {
  return (
    // Full load, same as the previous bar, so the logo clears client state.
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a href="/" className="vp-header-brand flex shrink-0 items-center">
      <VibePeepLogo size="md" className="vp-header-lockup" />
    </a>
  )
}
