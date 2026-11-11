'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Bookmark, Building2, CalendarRange, LogOut, Megaphone, Settings, ShieldCheck, Sparkles, User, Users } from 'lucide-react'
import { signOut } from 'next-auth/react'
import { TrustCount } from '@/components/admin-nav'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

type Item = {
  href?: string
  label: string
  Icon: typeof User
  onClick?: () => void
  extra?: ReactNode
}

/** Same destinations as the header account menu, in a thumb-height sheet. */
export function MenuSheet({
  open,
  onOpenChange,
  signedIn,
  name,
  isPromoter,
  isAdmin,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  signedIn: boolean
  name: string
  isPromoter: boolean
  isAdmin: boolean
}) {
  const close = () => onOpenChange(false)
  const venue = process.env.NEXT_PUBLIC_OWNERSHIP_UI !== '0'
  const items: Item[] = signedIn
    ? [
        { href: '/itinerary', label: 'Itinerary', Icon: CalendarRange },
        { href: '/watchlist', label: 'My VibePeep', Icon: Bookmark },
        { href: '/together', label: 'Plan with your crew', Icon: Users },
        { href: '/outings', label: 'Plan a day or night', Icon: Sparkles },
        { href: '/account', label: 'Your account & inbox', Icon: Settings },
        isPromoter
          ? { href: '/promoter', label: 'Promoter dashboard', Icon: Megaphone }
          : { href: '/promoters', label: 'For promoters', Icon: Megaphone },
        ...(venue ? [{ href: '/venue', label: 'My venue', Icon: Building2 }] : []),
        ...(isAdmin ? [{ href: '/admin/trust', label: 'Trust & listings', Icon: ShieldCheck, extra: <TrustCount className="ml-auto" /> }] : []),
        { label: 'Sign out', Icon: LogOut, onClick: () => { close(); void signOut({ redirectTo: '/' }) } },
      ]
    : [
        { href: '/login', label: 'Sign in', Icon: User },
        { href: '/signup', label: 'Sign up', Icon: User },
        { href: '/promoters', label: 'For promoters', Icon: Megaphone },
      ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" id="vp-menu-sheet" className="vp-ask-sheet vp-menu-sheet">
        <SheetHeader className="shrink-0 space-y-1 pr-8 text-left">
          <SheetTitle className="font-display">{signedIn ? name : 'Menu'}</SheetTitle>
          <SheetDescription className="sr-only">Account and site links</SheetDescription>
        </SheetHeader>
        <ul className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-1">
          {items.map((item) => {
            const { Icon } = item
            const className = 'flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left text-base font-medium hover:bg-muted'
            const inner = (
              <>
                <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">{item.label}</span>
                {item.extra}
              </>
            )
            return (
              <li key={item.label}>
                {item.href ? (
                  <Link href={item.href} className={className} onClick={close}>{inner}</Link>
                ) : (
                  <button type="button" className={className} onClick={item.onClick}>{inner}</button>
                )}
              </li>
            )
          })}
        </ul>
      </SheetContent>
    </Sheet>
  )
}
