'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { VibePeepLogo } from '@/components/vibepeep-logo'

const LINKS = [
  { href: '/admin', label: 'Dashboard', exact: true },
  { href: '/admin/trust', label: 'Trust & listings' },
  { href: '/admin/venues', label: 'Venue claims' },
  { href: '/admin/local', label: 'Local' },
  { href: '/admin/community', label: 'Community' },
  { href: '/admin/newsletter', label: 'Newsletter' },
  { href: '/admin/seo', label: 'SEO' },
  { href: '/admin/images', label: 'Images' },
  { href: '/admin/intel', label: 'Intelligence' },
  { href: '/admin/sponsorship', label: 'Sponsorship' },
]

export function TrustCount({ className }: { className?: string }) {
  const [pending, setPending] = useState<number | null>(null)
  useEffect(() => {
    let cancel = false
    fetch('/api/admin/trust?count=1').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!cancel && typeof d?.pending === 'number') setPending(d.pending)
    }).catch(() => {})
    return () => { cancel = true }
  }, [])
  if (pending == null) return null
  return (
    <span className={cn('inline-flex min-w-5 h-5 px-1.5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-semibold tabular-nums', className)} aria-label={`${pending} items need approval`}>
      {pending}
    </span>
  )
}

export function AdminNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Admin" className="border-b border-border bg-background/95 sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-12 flex items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        <Link href="/" aria-label="VibePeep home" className="mr-2 shrink-0">
          <VibePeepLogo size="sm" showTagline={false} />
        </Link>
        {LINKS.map((link) => {
          const on = link.exact ? pathname === link.href : pathname === link.href || pathname?.startsWith(`${link.href}/`)
          return (
            <Link key={link.href} href={link.href} aria-current={on ? 'page' : undefined}
              className={cn('shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-sm', on ? 'bg-foreground text-background font-semibold' : 'text-muted-foreground hover:text-foreground')}>
              {link.label}
              {link.href === '/admin/trust' && <TrustCount className={on ? 'bg-background text-foreground' : undefined} />}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
