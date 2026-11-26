'use client'

import Link from 'next/link'
import { Bookmark, Building2, Contrast, House, List, LogOut, MapPin, Megaphone, Monitor, Moon, Settings, ShieldCheck, Sparkles, Sun, User, Users } from 'lucide-react'
import type { ComponentType } from 'react'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useTheme } from 'next-themes'
import { TrustCount } from '@/components/admin-nav'
import { BottomNav } from '@/components/bottom-nav'
import { CalendarPlusIcon } from '@/components/calendar-plus-icon'
import { useMounted } from '@/components/client-only'
import { LogoHomeLink } from '@/components/logo'
import { PeepIcon } from '@/components/peep-icon'
import { SiteHeaderFrame } from '@/components/site-header-bar'
import { useHasLocalListings } from '@/components/use-has-local-listings'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { CITY_NAMES } from '@/lib/cities'
import { COPY } from '@/lib/copy'
import { navItem } from '@/lib/nav'
import { useSaved } from '@/lib/saved'
import { cn } from '@/lib/utils'

export type AppView = 'board' | 'map' | 'saved'

const TABS: { key: AppView; label: string; Icon: ComponentType<{ className?: string }>; href: string }[] = [
  { key: 'board', label: navItem('board').label, Icon: PeepIcon, href: '/' },
  { key: 'map', label: navItem('map').label, Icon: MapPin, href: '/map' },
  { key: 'saved', label: navItem('saved').label, Icon: Bookmark, href: '/saved' },
]

export function viewForPath(pathname: string | null): AppView | null {
  if (!pathname) return null
  if (pathname === '/map') return 'map'
  if (pathname === '/saved') return 'saved'
  if (pathname.startsWith('/local') || pathname.startsWith('/itinerary')) return null
  if (pathname === '/' || pathname.startsWith('/events')) return 'board'
  const head = pathname.split('/').filter(Boolean)[0]?.toLowerCase()
  if (head && CITY_NAMES.some((name) => name.toLowerCase().replace(/\s+/g, '-') === head)) return 'board'
  return null
}

function AppearanceMenu() {
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()
  const value = theme === 'light' || theme === 'dark' ? theme : 'system'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-10 sm:w-10"
          aria-label="Appearance"
        >
          <Contrast className="h-4 w-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40" collisionPadding={8}>
        <DropdownMenuRadioGroup aria-label="Appearance" value={mounted ? value : undefined} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light"><Sun className="mr-2 h-4 w-4" aria-hidden />Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark"><Moon className="mr-2 h-4 w-4" aria-hidden />Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system"><Monitor className="mr-2 h-4 w-4" aria-hidden />Auto</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AppHeader({ savedCount }: { savedCount: number }) {
  const mounted = useMounted()
  const pathname = usePathname()
  const view = viewForPath(pathname)
  const { data: session, status } = useSession()
  const user = session?.user
  const isPromoter = user?.role === 'PROMOTER' || user?.role === 'ADMIN'
  const hasListings = useHasLocalListings(!!user)

  return (
    <>
      <SiteHeaderFrame>
        <LogoHomeLink size="md" className="vp-header-brand" />
        <nav className="vp-top-links flex h-full min-w-0 items-stretch" aria-label="Primary">
          {(['board', 'map', 'local', 'saved'] as const).map((key) => {
            if (key === 'local') {
              return (
                <Link key="local" href="/local" aria-current={pathname?.startsWith('/local') ? 'page' : undefined} className={cn('relative flex shrink-0 items-center gap-1 px-2 text-xs sm:gap-1.5 sm:px-4 sm:text-sm', pathname?.startsWith('/local') ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')} aria-label="VibePeep Local">
                  <House className="h-4 w-4" /><span className="hidden lg:inline">{navItem('local').label}</span>
                  {pathname?.startsWith('/local') && <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-primary" />}
                </Link>
              )
            }
            const { label, Icon, href } = TABS.find((t) => t.key === key)!
            return (
              <Link
                key={key}
                href={href}
                aria-current={view === key ? 'page' : undefined}
                aria-label={key === 'saved' ? (mounted && savedCount > 0 ? `Saved, ${savedCount}` : 'Saved') : label}
                className={cn(
                  'relative flex shrink-0 items-center gap-1 px-2 text-xs transition-colors sm:gap-1.5 sm:px-4 sm:text-sm',
                  view === key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden lg:inline">{label}</span>
                {key === 'saved' && mounted && savedCount > 0 && (
                  <span className="min-w-[18px] rounded border border-border px-1 py-0.5 text-center font-mono text-xs">{savedCount}</span>
                )}
                {view === key && <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-primary" />}
              </Link>
            )
          })}
          <Link href="/itinerary" aria-current={pathname?.startsWith('/itinerary') ? 'page' : undefined} className={cn('relative flex shrink-0 items-center gap-1 px-2 text-xs sm:gap-1.5 sm:px-4 sm:text-sm', pathname?.startsWith('/itinerary') ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')} aria-label="Itinerary">
            <CalendarPlusIcon className="h-4 w-4" /><span className="hidden lg:inline">{navItem('itinerary').label}</span>
            {pathname?.startsWith('/itinerary') && <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-primary" />}
          </Link>
          <button type="button" className="relative flex shrink-0 items-center gap-1 px-2 text-xs text-muted-foreground hover:text-foreground sm:gap-1.5 sm:px-4 sm:text-sm" aria-label="Ask: search in your own words" onClick={() => window.dispatchEvent(new Event('vp-open-ask'))}>
            <Sparkles className="h-4 w-4" aria-hidden />
            <span className="hidden lg:inline">{navItem('ask').label}</span>
          </button>
        </nav>
        <div className="vp-header-tools ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <AppearanceMenu />
          {mounted && status !== 'loading' && (user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="vp-header-account flex h-10 w-10 items-center justify-center rounded-full bg-primary font-display text-sm font-bold text-primary-foreground hover:opacity-90" aria-label="Account menu">
                  {(user.name || user.email || '?').charAt(0).toUpperCase()}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{user.name || user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {!isPromoter && <DropdownMenuItem asChild><Link href="/itinerary"><CalendarPlusIcon className="mr-2 h-4 w-4" />Itinerary</Link></DropdownMenuItem>}
                {!isPromoter && <DropdownMenuItem asChild><Link href="/together"><Users className="mr-2 h-4 w-4" />Plan with your crew</Link></DropdownMenuItem>}
                <DropdownMenuItem asChild><Link href={isPromoter ? '/promoter/settings' : '/account'}><Settings className="mr-2 h-4 w-4" />{isPromoter ? 'Promoter settings' : 'Your account'}</Link></DropdownMenuItem>
                {hasListings && <DropdownMenuItem asChild><Link href="/local?tab=mine"><List className="mr-2 h-4 w-4" />Your listings</Link></DropdownMenuItem>}
                {user.role === 'PARTNER'
                  ? <DropdownMenuItem asChild><Link href="/partners"><Megaphone className="mr-2 h-4 w-4" />Source partner overview</Link></DropdownMenuItem>
                  : isPromoter
                  ? <DropdownMenuItem asChild><Link href="/promoter"><Megaphone className="mr-2 h-4 w-4" />Promoter dashboard</Link></DropdownMenuItem>
                  : null}
                {isPromoter && process.env.NEXT_PUBLIC_OWNERSHIP_UI !== '0' && (
                  <DropdownMenuItem asChild><Link href="/venue"><Building2 className="mr-2 h-4 w-4" />My venue</Link></DropdownMenuItem>
                )}
                {user.role === 'ADMIN' && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin/trust"><ShieldCheck className="mr-2 h-4 w-4" />Trust & listings <TrustCount className="ml-auto" /></Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut({ redirectTo: '/' })}><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="vp-header-account contents">
              <Link href="/login" className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground md:hidden" aria-label="Sign in"><User className="h-4 w-4" /></Link>
              <Link href="/login" className="hidden h-11 items-center px-3 text-sm text-muted-foreground hover:text-foreground md:inline-flex">Sign in</Link>
              <Link href="/signup" aria-label="Sign up" className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 sm:w-auto sm:px-4">
                <User className="h-4 w-4" /><span className="hidden sm:inline">Sign Up</span>
              </Link>
            </div>
          ))}
        </div>
      </SiteHeaderFrame>
      <BottomNav savedCount={mounted ? savedCount : 0} ready={mounted} />
    </>
  )
}

function MarketingHeader({ accountHref }: { accountHref: string }) {
  const { data, status } = useSession()
  const user = status === 'authenticated' ? data?.user : null
  const isPromoter = user?.role === 'PROMOTER' || user?.role === 'ADMIN'
  return (
    <SiteHeaderFrame>
      <LogoHomeLink size="md" className="vp-header-brand" />
      <p className="hidden shrink-0 text-sm font-semibold lg:block">for Promoters</p>
      <nav className="ml-auto flex min-w-0 items-center justify-end gap-2 text-sm sm:gap-3" aria-label="Promoters">
        <Link href="/promoters#packages" className="hidden whitespace-nowrap font-medium text-muted-foreground hover:text-foreground sm:inline">Pricing</Link>
        <Link href="/promoters#faq" className="hidden whitespace-nowrap font-medium text-muted-foreground hover:text-foreground md:inline">FAQ</Link>
        <Link href="/local-ads" className="hidden whitespace-nowrap font-medium text-muted-foreground hover:text-foreground sm:inline">Local business ads</Link>
        <Link href="/" className="hidden whitespace-nowrap font-medium text-muted-foreground hover:text-foreground lg:inline">Back to events</Link>
        {user ? (
          <>
            <Link href={isPromoter ? '/promoter' : accountHref} className="whitespace-nowrap font-semibold text-foreground">{isPromoter ? 'Dashboard' : 'Promoter tools'}</Link>
            <button type="button" onClick={() => signOut({ redirectTo: '/promoters' })} className="inline-flex min-h-11 items-center whitespace-nowrap font-medium text-muted-foreground hover:text-foreground">Sign out</button>
          </>
        ) : status === 'loading' ? null : (
          <>
            <Link href="/login?next=/promoter" className="inline-flex min-h-11 items-center whitespace-nowrap font-medium text-muted-foreground hover:text-foreground">{COPY.signIn}</Link>
            <Button asChild size="sm"><Link href={accountHref}><span className="sm:hidden">Join</span><span className="hidden sm:inline">Create free account</span></Link></Button>
          </>
        )}
      </nav>
    </SiteHeaderFrame>
  )
}

function AuthHeader() {
  return (
    <SiteHeaderFrame>
      <LogoHomeLink size="md" className="vp-header-brand" />
      <Link href="/" className="ml-auto inline-flex h-11 items-center px-3 text-sm font-medium text-muted-foreground hover:text-foreground">Back</Link>
    </SiteHeaderFrame>
  )
}

type SiteHeaderProps =
  | { variant?: 'app'; savedCount?: number; accountHref?: never }
  | { variant: 'marketing'; accountHref: string; savedCount?: never }
  | { variant: 'auth'; accountHref?: never; savedCount?: never }

/** One header. app, marketing and auth share the bar, the logo and the height. */
export function SiteHeader(props: SiteHeaderProps = {}) {
  const { saved } = useSaved()
  if (props.variant === 'marketing') return <MarketingHeader accountHref={props.accountHref} />
  if (props.variant === 'auth') return <AuthHeader />
  return <AppHeader savedCount={props.savedCount ?? saved.length} />
}

/** Pages that already pass a saved count. Same header as SiteHeader variant="app". */
export function Navbar({ savedCount }: { savedCount: number }) {
  return <SiteHeader variant="app" savedCount={savedCount} />
}
