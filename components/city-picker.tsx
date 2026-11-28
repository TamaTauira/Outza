'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, MapPin } from 'lucide-react'
import { CITIES, CITY_LABELS } from '@/lib/cities'
import { cityPickerPanelBox, type CityPickerPanelBox } from '@/lib/city-picker-panel'

/**
 * City dropdown. A native select cannot show the two-line entries (state
 * eyebrow, city label, coverage line), so this is a listbox popup on a button,
 * following the APG pattern: opening moves focus to the active option, arrows
 * move between options, Enter chooses, Escape closes. The value is always a
 * catalogue city name — region members such as Newcastle are not options;
 * they ride on the Sydney entry's coverage line.
 *
 * The panel is portalled to the body and fixed-positioned from the trigger's
 * measured rect. Two of its homes (the Home and Local heroes) sit inside the
 * hero card, whose overflow-hidden sliced an absolutely-positioned panel at
 * the card's bottom edge: rows cut mid-entry, the panel's own cap and scroll
 * never reached. Fixed positioning escapes the card; lib/city-picker-panel
 * then caps the panel at the space actually left in the viewport, so it
 * scrolls internally instead of running over the sections below or off the
 * bottom of the screen. The non-scrolling wrapper clips the rows to the
 * panel's rounded corners, so the active row's highlight can never bleed
 * outside them.
 */
export function CityPicker({ value, onChange, onDark, id, label = 'Choose a city' }: {
  value: string
  onChange: (city: string) => void
  onDark?: boolean
  id?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [box, setBox] = useState<CityPickerPanelBox | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<(HTMLLIElement | null)[]>([])

  const selectedIndex = CITIES.findIndex((c) => c.name === value)
  const selected = selectedIndex >= 0 ? CITIES[selectedIndex] : null
  const selectedLabel = selected ? (CITY_LABELS[selected.name]?.label ?? selected.name) : label

  const measure = useCallback(() => {
    const button = buttonRef.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    const next = cityPickerPanelBox(
      { bottom: rect.bottom, left: rect.left, width: rect.width },
      { width: window.innerWidth, height: window.innerHeight },
    )
    setBox((prev) => (
      prev && prev.top === next.top && prev.left === next.left && prev.width === next.width && prev.maxHeight === next.maxHeight
        ? prev
        : next
    ))
  }, [])

  useEffect(() => {
    if (!open) return
    optionRefs.current[active]?.focus()
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ])

  useEffect(() => {
    if (!open) return
    measure()
    let frame = 0
    const onViewportChange = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, { capture: true, passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, { capture: true })
    }
  }, [open, measure])

  const openList = () => {
    setActive(selectedIndex >= 0 ? selectedIndex : 0)
    measure()
    setOpen(true)
  }

  const closeList = (refocus: boolean) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  const choose = (index: number) => {
    const city = CITIES[index]
    if (city) onChange(city.name)
    closeList(true)
  }

  const focusOption = (index: number) => {
    const next = Math.min(Math.max(index, 0), CITIES.length - 1)
    setActive(next)
    optionRefs.current[next]?.focus()
  }

  const onListKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focusOption(active + 1); break
      case 'ArrowUp': e.preventDefault(); focusOption(active - 1); break
      case 'Home': e.preventDefault(); focusOption(0); break
      case 'End': e.preventDefault(); focusOption(CITIES.length - 1); break
      case 'Enter':
      case ' ': e.preventDefault(); choose(active); break
      case 'Escape': e.preventDefault(); closeList(true); break
      case 'Tab': closeList(false); break
    }
  }

  const onButtonKeyDown = (e: React.KeyboardEvent) => {
    if (open) {
      // Focus can be on the trigger while the panel is open (it never moved
      // into the list, or was returned here programmatically); the APG
      // pattern still expects Escape to close from the trigger itself, not
      // only from an option. Focus is already on the trigger, so closing is
      // all that is needed.
      if (e.key === 'Escape') {
        e.preventDefault()
        closeList(true)
      }
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      openList()
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        id={id}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? closeList(true) : openList())}
        onKeyDown={onButtonKeyDown}
        className={onDark
          ? 'flex h-control-lg w-full items-center gap-1.5 rounded-hero border border-white/25 bg-white/10 px-2.5 text-left text-sm font-medium text-white transition-colors hover:bg-white/15 min-[360px]:gap-2 min-[360px]:px-3 min-[360px]:text-base'
          : 'flex h-control-lg w-full items-center gap-1.5 rounded-hero border border-input bg-background px-2.5 text-left text-sm font-medium text-foreground min-[360px]:gap-2 min-[360px]:px-3 min-[360px]:text-base'}
      >
        <MapPin className={onDark ? 'h-5 w-5 shrink-0 text-white' : 'h-5 w-5 shrink-0 text-primary'} aria-hidden />
        <span className="min-w-0 flex-1 truncate max-[359px]:tracking-tight">{selectedLabel}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && box && createPortal(
        <div
          ref={panelRef}
          style={{ top: box.top, left: box.left, width: box.width }}
          className="fixed z-50 overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
        >
          <ul
            role="listbox"
            aria-label={label}
            onKeyDown={onListKeyDown}
            style={{ maxHeight: box.maxHeight }}
            className="overflow-y-auto overscroll-contain py-1.5 text-popover-foreground"
          >
            {CITIES.map((city, i) => {
              const wording = CITY_LABELS[city.name]
              const isSelected = city.name === value
              return (
                <li
                  key={city.name}
                  ref={(el) => { optionRefs.current[i] = el }}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={-1}
                  onFocus={() => setActive(i)}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={`cursor-pointer px-3 py-2 outline-none ${i === active ? 'bg-muted' : ''} ${isSelected ? 'dark:bg-primary/15' : ''}`}
                >
                  <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {wording?.eyebrow ?? city.state}
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2 text-sm font-medium text-foreground">
                    {wording?.label ?? city.name}
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                  </span>
                  {wording?.coverage && (
                    <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{wording.coverage}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  )
}
