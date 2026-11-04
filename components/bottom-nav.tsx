'use client'

import Link from 'next/link'
import { Bookmark, CalendarRange, House, LayoutList, MapPin } from 'lucide-react'
import { usePathname } from 'next/navigation'
import './bottom-nav.css'

const TABS = [
  { key: 'board', label: 'Board', href: '/', Icon: LayoutList },
  { key: 'map', label: 'Map', href: '/map', Icon: MapPin },
  { key: 'local', label: 'Local', href: '/local', Icon: House },
  { key: 'saved', label: 'Saved', href: '/saved', Icon: Bookmark },
  { key: 'plan', label: 'Plan', href: '/itinerary', Icon: CalendarRange },
] as const

function tabCurrent(key: (typeof TABS)[number]['key'], pathname: string | null) {
  if (key === 'local') return pathname?.startsWith('/local') ?? false
  if (key === 'plan') return pathname?.startsWith('/itinerary') ?? false
  if (pathname?.startsWith('/local') || pathname?.startsWith('/itinerary')) return false
  if (key === 'map') return pathname === '/map'
  if (key === 'saved') return pathname === '/saved'
  if (pathname === '/map' || pathname === '/saved') return false
  return key === 'board'
}

/** Fixed destination bar. Hidden from desktop and tablet landscape in CSS. */
export function BottomNav({ savedCount }: { savedCount: number }) {
  const pathname = usePathname()

  return (
    <nav className="vp-bottom-nav" aria-label="Primary">
      <div className="vp-bottom-nav-inner">
        {TABS.map(({ key, label, href, Icon }) => {
          const current = tabCurrent(key, pathname)
          const name = key === 'plan' ? 'Itinerary' : key === 'saved' ? `Saved, ${savedCount}` : key === 'local' ? 'VibePeep Local' : label
          return (
            <Link
              key={key}
              href={href}
              aria-current={current ? 'page' : undefined}
              aria-label={name}
              className="vp-bottom-tab"
            >
              <span className="vp-bottom-ico">
                <Icon className="h-5 w-5" aria-hidden />
                {key === 'saved' && <span className="vp-bottom-count" aria-hidden="true">{savedCount}</span>}
              </span>
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
