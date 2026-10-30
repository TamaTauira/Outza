'use client'

import Link from 'next/link'
import { LayoutList, MapPin, Bookmark, Sun, Moon, User, LogOut, Megaphone, Settings, CalendarRange, House, Users, Sparkles, ShieldCheck } from 'lucide-react'
import { TrustCount } from '@/components/admin-nav'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useSession, signOut } from 'next-auth/react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useMounted } from '@/components/client-only'
import { cn } from '@/lib/utils'
import { VibePeepLogo } from '@/components/vibepeep-logo'

export type AppView = 'board' | 'map' | 'saved'

interface NavbarProps {
  savedCount: number
}

// Board, Map and Saved each have their own address, so Back, bookmarks and sharing all work.
const TABS: { key: AppView; label: string; Icon: typeof LayoutList; href: string }[] = [
  { key: 'board', label: 'Board', Icon: LayoutList, href: '/' },
  { key: 'map', label: 'Map', Icon: MapPin, href: '/map' },
  { key: 'saved', label: 'Saved', Icon: Bookmark, href: '/saved' },
]

export function viewForPath(pathname: string | null): AppView | null {
  if (pathname === '/map') return 'map'
  if (pathname === '/saved') return 'saved'
  if (pathname?.startsWith('/local') || pathname?.startsWith('/itinerary')) return null
  return 'board'
}

export function Navbar({ savedCount }: NavbarProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useMounted()
  const pathname = usePathname()
  const view = viewForPath(pathname)
  const { data: session, status } = useSession()
  const user = session?.user
  const isPromoter = user?.role === 'PROMOTER' || user?.role === 'ADMIN'

  return (
    <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-md">
      <div className="max-w-[1280px] mx-auto px-2 sm:px-6 h-14 sm:h-16 flex items-center gap-1 min-w-0 border-b border-border">
        <a href="/" className="flex items-center gap-2.5 shrink-0" aria-label="VibePeep home">
          <VibePeepLogo size="md" labelClassName="hidden sm:flex" />
        </a>

        <nav className="flex items-stretch h-full min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(['board', 'map', 'local', 'saved'] as const).map((key) => {
            if (key === 'local') {
              return (
                <Link key="local" href="/local" className={cn('relative flex shrink-0 items-center gap-1 px-2 sm:gap-1.5 sm:px-4 text-[11px] sm:text-sm', pathname?.startsWith('/local') ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')} aria-label="VibePeep Local">
                  <House className="w-4 h-4" /><span>Local</span>
                  {pathname?.startsWith('/local') && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary" />}
                </Link>
              )
            }
            const { label, Icon, href } = TABS.find((t) => t.key === key)!
            return (
              <Link
                key={key}
                href={href}
                aria-current={view === key ? 'page' : undefined}
                aria-label={key === 'saved' ? `Saved (${mounted ? savedCount : 0})` : label}
                className={cn(
                  'relative flex shrink-0 items-center gap-1 px-2 sm:gap-1.5 sm:px-4 text-[11px] sm:text-sm transition-colors',
                  view === key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
                {key === 'saved' && (
                  <span className="min-w-[18px] px-1 py-0.5 rounded border border-border font-mono text-[10px] text-center">{mounted ? savedCount : 0}</span>
                )}
                {view === key && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary" />}
              </Link>
            )
          })}
          <Link href="/itinerary" className={cn('relative flex shrink-0 items-center gap-1 px-2 sm:gap-1.5 sm:px-4 text-[11px] sm:text-sm', pathname?.startsWith('/itinerary') ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')} aria-label="Itinerary">
            <CalendarRange className="w-4 h-4" /><span className="sm:hidden">Plan</span><span className="hidden sm:inline">Itinerary</span>
            {pathname?.startsWith('/itinerary') && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary" />}
          </Link>
        </nav>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-auto">
          <button
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Toggle light or dark mode"
          >
            {mounted && resolvedTheme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
          {mounted && status !== 'loading' && (user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-10 h-10 rounded-full bg-primary text-primary-foreground font-display font-bold text-sm flex items-center justify-center hover:opacity-90" aria-label="Account menu">
                  {(user.name || user.email || '?').charAt(0).toUpperCase()}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{user.name || user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/itinerary"><CalendarRange className="w-4 h-4 mr-2" />Itinerary</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/watchlist"><Bookmark className="w-4 h-4 mr-2" />My VibePeep</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/together"><Users className="w-4 h-4 mr-2" />VibePeep Together</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/outings"><Sparkles className="w-4 h-4 mr-2" />Day and night plans</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/account"><Settings className="w-4 h-4 mr-2" />My account & emails</Link></DropdownMenuItem>
                {isPromoter
                  ? <DropdownMenuItem asChild><Link href="/promoter"><Megaphone className="w-4 h-4 mr-2" />Promoter dashboard</Link></DropdownMenuItem>
                  : <DropdownMenuItem asChild><Link href="/promoters"><Megaphone className="w-4 h-4 mr-2" />For promoters</Link></DropdownMenuItem>}
                {user.role === 'ADMIN' && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin/trust"><ShieldCheck className="w-4 h-4 mr-2" />Trust & listings <TrustCount className="ml-auto" /></Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut({ redirectTo: '/' })}><LogOut className="w-4 h-4 mr-2" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link href="/promoters" className="hidden lg:inline-flex h-10 items-center gap-1.5 px-3 text-sm text-muted-foreground hover:text-foreground"><Megaphone className="w-4 h-4" />For promoters</Link>
              <Link href="/login" className="inline-flex md:hidden h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground" aria-label="Sign in"><User className="w-4 h-4" /></Link>
              <Link href="/login" className="hidden md:inline-flex h-10 items-center px-3 text-sm text-muted-foreground hover:text-foreground">Sign In</Link>
              <Link href="/signup" aria-label="Sign up" className="inline-flex h-10 w-10 sm:w-auto shrink-0 items-center justify-center gap-1.5 sm:px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">
                <User className="w-4 h-4" /><span className="hidden sm:inline">Sign Up</span>
              </Link>
            </>
          ))}
        </div>
      </div>
    </header>
  )
}
