'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Bookmark, House, MapPin, Sparkles, User } from 'lucide-react'
import { CalendarPlusIcon } from '@/components/calendar-plus-icon'
import { PeepIcon } from '@/components/peep-icon'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { AskSheet } from '@/components/ask-sheet'
import { DecorativeGlow } from '@/components/decorative-glow'
import { MenuSheet } from '@/components/menu-sheet'
import { navShouldHide, shouldPopSaved } from '@/lib/bottom-nav'
import type { SearchHints } from '@/lib/search-hints'
import { navItem } from '@/lib/nav'
import './bottom-nav.css'

const LEFT = [
  { key: 'board', label: navItem('board').label, href: '/', Icon: PeepIcon },
  { key: 'map', label: navItem('map').label, href: '/map', Icon: MapPin },
  { key: 'local', label: navItem('local').label, href: '/local', Icon: House },
] as const

const RIGHT = [
  { key: 'itinerary', label: navItem('itinerary').label, href: '/itinerary', Icon: CalendarPlusIcon },
  { key: 'saved', label: navItem('saved').label, href: '/saved', Icon: Bookmark },
] as const

type TabKey = (typeof LEFT)[number]['key'] | (typeof RIGHT)[number]['key']

function tabCurrent(key: TabKey, pathname: string | null) {
  if (pathname?.startsWith('/account') || pathname?.startsWith('/together')) return false
  if (key === 'local') return pathname?.startsWith('/local') ?? false
  if (key === 'itinerary') return pathname?.startsWith('/itinerary') ?? false
  if (pathname?.startsWith('/local') || pathname?.startsWith('/itinerary')) return false
  if (key === 'map') return pathname === '/map'
  if (key === 'saved') return pathname === '/saved'
  if (pathname === '/map' || pathname === '/saved') return false
  return key === 'board'
}

function buzz() {
  try {
    navigator.vibrate?.(10)
  } catch { /* unsupported */ }
}

function bounceIcon(target: EventTarget | null) {
  const icon = target instanceof Element ? target.querySelector('.vp-bottom-ico, .vp-ask-face') : null
  if (!(icon instanceof HTMLElement)) return
  icon.classList.remove('is-tapped')
  void icon.offsetWidth
  icon.classList.add('is-tapped')
}

function fieldFocused() {
  const el = document.activeElement
  if (!(el instanceof HTMLElement)) return false
  if (el.closest('.vp-bottom-nav, .vp-ask-sheet, .vp-menu-sheet, [role="dialog"]')) return true
  if (document.documentElement.classList.contains('vp-ask-open') || document.documentElement.classList.contains('vp-menu-open')) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

function sydneyToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function pageCity() {
  const select = document.querySelector('select[aria-label="Choose a city"]')
  if (select instanceof HTMLSelectElement && select.value) return select.value
  return 'Sydney'
}

/** Fixed destination bar. Hidden from desktop and tablet landscape in CSS. */
export function BottomNav({ savedCount, ready = true }: { savedCount: number; ready?: boolean }) {
  const pathname = usePathname()
  const navRef = useRef<HTMLElement>(null)
  const [askOpen, setAskOpen] = useState(false)
  const [askRequest, setAskRequest] = useState<{ id: number; text: string; hints?: SearchHints } | null>(null)
  const askButton = useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [askCity, setAskCity] = useState('Sydney')
  const [askToday, setAskToday] = useState('')
  const { data: session, status } = useSession()
  const user = session?.user
  const signedIn = status === 'authenticated' && !!user
  const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase()
  const isPromoter = user?.role === 'PROMOTER' || user?.role === 'ADMIN'
  const [pop, setPop] = useState(false)
  const prevCount = useRef<number | null>(null)
  const wasReady = useRef(false)

  useEffect(() => {
    if (!ready) return
    if (!wasReady.current) {
      wasReady.current = true
      prevCount.current = savedCount
      return
    }
    const grew = shouldPopSaved(prevCount.current, savedCount, true)
    prevCount.current = savedCount
    if (!grew) return
    setPop(true)
    const timer = window.setTimeout(() => setPop(false), 480)
    return () => window.clearTimeout(timer)
  }, [ready, savedCount])

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ q?: string; hints?: SearchHints }>).detail
      const text = detail?.q?.trim() ?? ''
      setAskCity(pageCity())
      setAskToday(sydneyToday())
      if (text) setAskRequest({ id: Date.now(), text, hints: detail?.hints })
      setAskOpen(true)
    }
    window.addEventListener('vp-open-ask', open)
    return () => window.removeEventListener('vp-open-ask', open)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('vp-ask-open', askOpen)
    document.documentElement.classList.toggle('vp-menu-open', menuOpen)
    return () => {
      document.documentElement.classList.remove('vp-ask-open')
      document.documentElement.classList.remove('vp-menu-open')
    }
  }, [askOpen, menuOpen])

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    let last = window.scrollY
    let away = false
    const setAway = (next: boolean) => {
      if (next === away) return
      away = next
      nav.classList.toggle('is-away', next)
      document.documentElement.classList.toggle('vp-nav-away', next)
    }
    const onScroll = () => {
      const scrollY = window.scrollY
      const delta = scrollY - last
      last = scrollY
      const next = navShouldHide({
        scrollY,
        delta,
        viewportH: window.innerHeight,
        scrollH: document.documentElement.scrollHeight,
        locked: askOpen || menuOpen || fieldFocused(),
      })
      if (next != null) setAway(next)
    }
    const showIfLocked = () => {
      if (askOpen || menuOpen || fieldFocused()) setAway(false)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('focusin', showIfLocked)
    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('focusin', showIfLocked)
      nav.classList.remove('is-away')
      document.documentElement.classList.remove('vp-nav-away')
    }
  }, [askOpen, menuOpen])

  const openAsk = () => {
    setAskCity(pageCity())
    setAskToday(sydneyToday())
    setAskOpen(true)
  }

  const tab = (item: (typeof LEFT)[number] | (typeof RIGHT)[number]) => {
    const current = tabCurrent(item.key, pathname)
    const name = item.key === 'saved' ? (savedCount > 0 ? `Saved, ${savedCount}` : 'Saved') : item.key === 'local' ? 'VibePeep Local' : item.label === 'Itinerary' ? 'Itinerary' : item.label
    const { Icon } = item
    return (
      <Link
        key={item.key}
        href={item.href}
        aria-current={current ? 'page' : undefined}
        aria-label={name}
        className="vp-bottom-tab"
        onPointerDown={(event) => {
          bounceIcon(event.currentTarget)
          buzz()
        }}
      >
        <span className="vp-bottom-ico">
          <Icon className="h-5 w-5" aria-hidden />
          {item.key === 'saved' && savedCount > 0 && (
            <span className={pop ? 'vp-bottom-count is-pop' : 'vp-bottom-count'} aria-hidden="true">{savedCount}</span>
          )}
        </span>
        <span className="vp-tab-label">{item.label}</span>
      </Link>
    )
  }

  return (
    <>
      <nav ref={navRef} className="vp-bottom-nav" aria-label="Primary">
        <DecorativeGlow />
        <div className="vp-bottom-nav-inner">
          {LEFT.map(tab)}
          <button
            ref={askButton}
            type="button"
            className="vp-ask"
            aria-label="Ask: search in your own words"
            aria-expanded={askOpen}
            aria-controls="vp-ask-sheet"
            onPointerDown={(event) => {
              bounceIcon(event.currentTarget)
              buzz()
            }}
            onClick={openAsk}
          >
            <span className="vp-ask-face">
              <Sparkles className="h-6 w-6" aria-hidden />
            </span>
            <span className="vp-ask-label vp-tab-label">{navItem('ask').label}</span>
          </button>
          {RIGHT.map(tab)}
          <button
            type="button"
            className="vp-bottom-tab vp-menu"
            aria-current={pathname?.startsWith('/account') ? 'page' : undefined}
            aria-label={signedIn ? `Menu, ${user?.name || user?.email || 'account'}` : 'Menu'}
            aria-expanded={menuOpen}
            aria-controls="vp-menu-sheet"
            onPointerDown={(event) => {
              bounceIcon(event.currentTarget)
              buzz()
            }}
            onClick={() => setMenuOpen(true)}
          >
            <span className="vp-bottom-ico">
              {signedIn ? <span className="vp-menu-initial" aria-hidden>{initial}</span> : <User className="h-5 w-5" aria-hidden />}
            </span>
            <span className="vp-tab-label">{navItem('menu').label}</span>
          </button>
        </div>
      </nav>
      <AskSheet open={askOpen} onOpenChange={setAskOpen} city={askCity} today={askToday} queryRequest={askRequest} returnFocus={() => askButton.current?.focus()} />
      <MenuSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        signedIn={signedIn}
        name={user?.name || user?.email || 'Account'}
        isPromoter={isPromoter}
        isAdmin={user?.role === 'ADMIN'}
      />
    </>
  )
}
