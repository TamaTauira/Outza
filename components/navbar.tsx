'use client'

import Link from 'next/link'
import { LayoutList, MapPin, Bookmark, Sun, Moon, User, LogOut, Megaphone, Settings, CalendarRange, Store } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useSession, signOut } from 'next-auth/react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useMounted } from '@/components/client-only'
import { cn } from '@/lib/utils'
import { OutzaLogo } from '@/components/outza-logo'

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
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3 border-b border-border">
        <a href="/" className="flex items-center gap-2.5 shrink-0" aria-label="Outza home">
          <OutzaLogo size="md" labelClassName="hidden sm:flex" />
        </a>

        <nav className="flex items-stretch h-full">
          {(['board', 'map', 'local', 'saved'] as const).map((key) => {
            if (key === 'local') {
              return (
                <Link key="local" href="/local" className={cn('relative flex items-center gap-2 px-3 sm:px-4 text-sm', pathname?.startsWith('/local') ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')} aria-label="OUTZA Local">
                  <Store className="w-4 h-4" /><span className="hidden sm:inline">Local</span>
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
                  'relative flex items-center gap-2 px-3 sm:px-4 text-sm transition-colors',
                  view === key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
                {key === 'saved' && (
                  <span className="min-w-[20px] px-1 py-0.5 rounded border border-border font-mono text-[10px] text-center">{mounted ? savedCount : 0}</span>
                )}
                {view === key && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary" />}
              </Link>
            )
          })}
          <Link href="/itinerary" className={cn('relative flex items-center gap-2 px-3 sm:px-4 text-sm', pathname?.startsWith('/itinerary') ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')} aria-label="Itinerary">
            <CalendarRange className="w-4 h-4" /><span className="hidden md:inline">Itinerary</span>
            {pathname?.startsWith('/itinerary') && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary" />}
          </Link>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="w-10 h-10 shrink-0 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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
                <DropdownMenuItem asChild><Link href="/account"><Settings className="w-4 h-4 mr-2" />My account & emails</Link></DropdownMenuItem>
                {isPromoter
                  ? <DropdownMenuItem asChild><Link href="/promoter"><Megaphone className="w-4 h-4 mr-2" />Promoter dashboard</Link></DropdownMenuItem>
                  : <DropdownMenuItem asChild><Link href="/promoters"><Megaphone className="w-4 h-4 mr-2" />For promoters</Link></DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut({ redirectTo: '/' })}><LogOut className="w-4 h-4 mr-2" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="lg:hidden w-10 h-10 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90" aria-label="For promoters, sign in, and sign up">
                    <User className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem asChild><Link href="/promoters"><Megaphone className="w-4 h-4 mr-2" />For promoters</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link href="/login">Sign In</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link href="/signup"><User className="w-4 h-4 mr-2" />Sign Up</Link></DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Link href="/promoters" className="hidden lg:inline-flex h-10 items-center gap-1.5 px-3 text-sm text-muted-foreground hover:text-foreground"><Megaphone className="w-4 h-4" />For promoters</Link>
              <Link href="/login" className="hidden lg:inline-flex h-10 items-center px-3 text-sm text-muted-foreground hover:text-foreground">Sign In</Link>
              <Link href="/signup" className="hidden lg:inline-flex h-10 items-center gap-1.5 px-3 sm:px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">
                <User className="w-4 h-4" />Sign Up
              </Link>
            </>
          ))}
        </div>
      </div>
    </header>
  )
}
