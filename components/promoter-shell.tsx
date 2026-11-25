'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { BarChart3, Brain, Building2, CalendarDays, CircleHelp, LayoutDashboard, LogOut, Megaphone, Menu, Receipt, Rocket, Settings, Store } from 'lucide-react'
import { Logo } from '@/components/logo'
import { VP_COLOUR } from '@/lib/design-tokens'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { PROMOTER_NAV_EVENT } from '@/lib/promoter-nav'
import { cn } from '@/lib/utils'

const PRIMARY = [
  { href: '/promoter?tab=overview', label: 'Dashboard', icon: LayoutDashboard, tab: 'overview' },
  { href: '/promoter?tab=events', label: 'My events', icon: CalendarDays, tab: 'events' },
  { href: '/promoter?tab=promote', label: 'Promote an event', icon: Rocket, tab: 'promote' },
  { href: '/promoter?tab=boosts', label: 'Short boosts', icon: Megaphone, tab: 'boosts' },
  { href: '/promoter?tab=intel', label: 'Intelligence', icon: Brain, tab: 'intel' },
  { href: '/promoter?tab=local', label: 'Local business ads', icon: Store, tab: 'local' },
  { href: '/promoter?tab=insights', label: 'Analytics', icon: BarChart3, tab: 'insights' },
  { href: '/promoter?tab=billing', label: 'Billing', icon: Receipt, tab: 'billing' },
] as const

const TEXT_LINKS = [
  { href: '/venue', label: 'Venue', icon: Building2 },
  { href: '/promoter/settings', label: 'Settings', icon: Settings },
  { href: '/promoter/help', label: 'Help', icon: CircleHelp },
] as const

const MOBILE = [
  { href: '/promoter?tab=overview', label: 'Dashboard', icon: LayoutDashboard, tab: 'overview' },
  { href: '/promoter?tab=events', label: 'Events', icon: CalendarDays, tab: 'events' },
  { href: '/promoter?tab=promote', label: 'Promote', icon: Rocket, tab: 'promote' },
  { href: '/promoter?tab=insights', label: 'Analytics', icon: BarChart3, tab: 'insights' },
] as const

const MORE = [
  { href: '/promoter?tab=boosts', label: 'Short boosts', icon: Megaphone },
  { href: '/promoter?tab=intel', label: 'Intelligence', icon: Brain },
  { href: '/promoter?tab=local', label: 'Local business ads', icon: Store },
  { href: '/promoter?tab=billing', label: 'Billing', icon: Receipt },
  { href: '/venue', label: 'Venue', icon: Building2 },
  { href: '/promoter/settings', label: 'Settings', icon: Settings },
  { href: '/promoter/help', label: 'Help', icon: CircleHelp },
  { href: '/', label: 'View the public site', icon: LayoutDashboard },
] as const

function tabFromSearch(search: string): string | null {
  return new URLSearchParams(search.replace(/^\?/, '')).get('tab')
}

function samePromoterPage(href: string): boolean {
  if (typeof window === 'undefined') return false
  if (window.location.pathname !== '/promoter') return false
  const url = new URL(href, window.location.origin)
  return url.pathname === '/promoter'
}

function onPromoterClick(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
  if (!samePromoterPage(href)) return
  event.preventDefault()
  const url = new URL(href, window.location.origin)
  const next = url.pathname + url.search
  if (next !== window.location.pathname + window.location.search) {
    window.history.pushState(window.history.state, '', next)
  }
  window.dispatchEvent(new Event(PROMOTER_NAV_EVENT))
}

export function PromoterAppShell({ children, backHref, backLabel = 'My events' }: {
  children: React.ReactNode
  backHref?: string
  backLabel?: string
}) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [search, setSearch] = useState('')
  const [more, setMore] = useState(false)
  const accountName = session?.user?.name || ''
  const accountEmail = session?.user?.email || ''
  const signOutPromoter = () => { void signOut({ redirectTo: '/promoters' }) }

  useEffect(() => {
    document.body.classList.add('vp-promoter-app')
    return () => document.body.classList.remove('vp-promoter-app')
  }, [])

  useEffect(() => {
    const read = () => setSearch(window.location.search)
    read()
    window.addEventListener('popstate', read)
    window.addEventListener(PROMOTER_NAV_EVENT, read)
    return () => {
      window.removeEventListener('popstate', read)
      window.removeEventListener(PROMOTER_NAV_EVENT, read)
    }
  }, [pathname])

  const tab = tabFromSearch(search)
  const onDashboard = pathname === '/promoter'
  const active = (key: string) => {
    if (!onDashboard) return false
    if (key === 'overview') return !tab || tab === 'overview'
    if (key === 'promote') return tab === 'promote'
    return tab === key
  }

  return (
    <div className="min-h-screen print:bg-white" style={{ backgroundColor: VP_COLOUR.bgCanvas }}>
      <style>{'body.vp-promoter-app .vp-site-footer{display:none}'}</style>
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-white/10 px-4 print:hidden lg:hidden" style={{ backgroundColor: VP_COLOUR.bgSurface }}>
        <Link href="/promoter?tab=overview" onClick={(event) => onPromoterClick(event, '/promoter?tab=overview')} aria-label="VibePeep promoter dashboard" className="inline-flex min-w-0 items-center">
          <Logo size="sm" tone="on-dark" decorative />
        </Link>
        <button type="button" onClick={signOutPromoter} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 px-2 text-sm font-semibold text-white">
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </button>
      </div>
      <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-screen w-[240px] flex-col text-white print:hidden lg:flex" style={{ backgroundColor: VP_COLOUR.bgSurface }}>
          <div className="vp-page-top px-4 pb-2">
            <Link href="/promoter?tab=overview" onClick={(event) => onPromoterClick(event, '/promoter?tab=overview')} aria-label="VibePeep promoter dashboard" className="block w-full">
              <Logo size="sm" tone="on-dark" decorative />
            </Link>
            <p className="mt-2 text-xs text-white/60">Promoter</p>
          </div>
          <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-4" aria-label="Promoter">
            {PRIMARY.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active(item.tab) ? 'page' : undefined}
                onClick={(event) => onPromoterClick(event, item.href)}
                className={cn('flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-white/80 hover:bg-white/10 hover:text-white', active(item.tab) && 'bg-white/10 font-semibold text-white')}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col border-t border-white/10 pt-3">
              {TEXT_LINKS.map((item) => (
                <Link key={item.href} href={item.href} className={cn('flex min-h-11 items-center gap-2 px-3 text-sm text-white/80 hover:text-white', pathname === item.href && 'font-semibold text-white')}>
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="mt-auto border-t border-white/10 pt-3">
              {(accountName || accountEmail) && (
                <p className="px-3 pb-1 text-xs text-white/70">
                  {accountName ? <span className="block truncate font-semibold text-white">{accountName}</span> : null}
                  {accountEmail ? <span className="block truncate">{accountEmail}</span> : null}
                </p>
              )}
              <button type="button" onClick={signOutPromoter} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-white/80 hover:text-white">
                <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                Sign out
              </button>
              <Link href="/" className="flex min-h-11 items-center px-3 text-sm text-white/80 hover:text-white">View the public site</Link>
            </div>
          </nav>
        </aside>
        <div className="min-h-screen min-w-0 bg-background pb-24 print:min-h-0 print:bg-white print:pb-0 lg:pb-0">
          {backHref && (
            <div className="px-4 pt-4 print:hidden sm:px-6">
              <Link href={backHref} onClick={(event) => onPromoterClick(event, backHref)} className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground hover:text-foreground">
                ← {backLabel}
              </Link>
            </div>
          )}
          {children}
        </div>
      </div>
      <nav className="vp-promoter-tabbar fixed inset-x-0 bottom-0 z-40 border-t border-white/10 text-white print:hidden lg:hidden" style={{ backgroundColor: VP_COLOUR.bgSurface, paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label="Promoter">
        <div className="grid grid-cols-5">
          {MOBILE.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active(item.tab) ? 'page' : undefined}
              onClick={(event) => onPromoterClick(event, item.href)}
              className={cn('flex min-h-11 flex-col items-center justify-center gap-1 px-1 py-1.5 text-caption leading-tight', active(item.tab) ? 'font-semibold text-white' : 'text-white/65')}
            >
              <item.icon className="h-5 w-5" aria-hidden />
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            className="flex min-h-11 flex-col items-center justify-center gap-1 px-1 py-1.5 text-caption leading-tight text-white/65"
            aria-expanded={more}
            aria-haspopup="dialog"
            onClick={() => setMore(true)}
          >
            <Menu className="h-5 w-5" aria-hidden />
            More
          </button>
        </div>
      </nav>
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="border-white/10 text-white" style={{ backgroundColor: VP_COLOUR.bgSurface }}>
          <SheetHeader>
            <SheetTitle className="text-white">More</SheetTitle>
            <SheetDescription className="text-white/70">Everything else in your promoter tools.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex flex-col">
            {MORE.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMore(false)} className="flex min-h-11 items-center gap-2 text-base text-white">
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            ))}
            <button type="button" onClick={() => { setMore(false); signOutPromoter() }} className="flex min-h-11 items-center gap-2 text-left text-base text-white">
              <LogOut className="h-4 w-4 shrink-0" aria-hidden />
              Sign out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
