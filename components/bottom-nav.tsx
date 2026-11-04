'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Bookmark, House, LayoutList, MapPin, Sparkles } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { AskSheet } from '@/components/ask-sheet'
import { navShouldHide, shouldPopSaved } from '@/lib/bottom-nav'
import './bottom-nav.css'

const LEFT = [
  { key: 'board', label: 'Board', href: '/', Icon: LayoutList },
  { key: 'map', label: 'Map', href: '/map', Icon: MapPin },
] as const

const RIGHT = [
  { key: 'local', label: 'Local', href: '/local', Icon: House },
  { key: 'saved', label: 'Saved', href: '/saved', Icon: Bookmark },
] as const

type TabKey = (typeof LEFT)[number]['key'] | (typeof RIGHT)[number]['key']

function tabCurrent(key: TabKey, pathname: string | null) {
  if (key === 'local') return pathname?.startsWith('/local') ?? false
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
  if (el.closest('.vp-bottom-nav, .vp-ask-sheet, [role="dialog"]')) return true
  if (document.documentElement.classList.contains('vp-ask-open')) return true
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
  const [askCity, setAskCity] = useState('Sydney')
  const [askToday, setAskToday] = useState('')
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
    document.documentElement.classList.toggle('vp-ask-open', askOpen)
    return () => document.documentElement.classList.remove('vp-ask-open')
  }, [askOpen])

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
        locked: askOpen || fieldFocused(),
      })
      if (next != null) setAway(next)
    }
    const showIfLocked = () => {
      if (askOpen || fieldFocused()) setAway(false)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('focusin', showIfLocked)
    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('focusin', showIfLocked)
      nav.classList.remove('is-away')
      document.documentElement.classList.remove('vp-nav-away')
    }
  }, [askOpen])

  const openAsk = () => {
    const hero = document.getElementById('ai-search')
    if (hero instanceof HTMLInputElement && hero.offsetParent !== null && !askOpen) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      hero.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
      hero.focus()
      return
    }
    setAskCity(pageCity())
    setAskToday(sydneyToday())
    setAskOpen(true)
  }

  const tab = (item: (typeof LEFT)[number] | (typeof RIGHT)[number]) => {
    const current = tabCurrent(item.key, pathname)
    const name = item.key === 'saved' ? `Saved, ${savedCount}` : item.key === 'local' ? 'VibePeep Local' : item.label
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
          {item.key === 'saved' && (
            <span className={pop ? 'vp-bottom-count is-pop' : 'vp-bottom-count'} aria-hidden="true">{savedCount}</span>
          )}
        </span>
        <span>{item.label}</span>
      </Link>
    )
  }

  return (
    <>
      <nav ref={navRef} className="vp-bottom-nav" aria-label="Primary">
        <div className="vp-bottom-nav-inner">
          {LEFT.map(tab)}
          <button
            type="button"
            className="vp-ask"
            aria-label="Ask VibePeep"
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
            <span className="vp-ask-label">Ask</span>
          </button>
          {RIGHT.map(tab)}
        </div>
      </nav>
      <AskSheet open={askOpen} onOpenChange={setAskOpen} city={askCity} today={askToday} />
    </>
  )
}
