'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, MapPin } from 'lucide-react'
import { CITIES, CITY_LABELS } from '@/lib/cities'

/**
 * City dropdown. A native select cannot show the two-line entries (state
 * eyebrow, city label, coverage line), so this is a listbox popup on a button,
 * following the APG pattern: opening moves focus to the active option, arrows
 * move between options, Enter chooses, Escape closes. The value is always a
 * catalogue city name — region members such as Newcastle are not options;
 * they ride on the Sydney entry's coverage line.
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
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<(HTMLLIElement | null)[]>([])

  const selectedIndex = CITIES.findIndex((c) => c.name === value)
  const selected = selectedIndex >= 0 ? CITIES[selectedIndex] : null
  const selectedLabel = selected ? (CITY_LABELS[selected.name]?.label ?? selected.name) : label

  useEffect(() => {
    if (!open) return
    optionRefs.current[active]?.focus()
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ])

  const openList = () => {
    setActive(selectedIndex >= 0 ? selectedIndex : 0)
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
    if (open) return
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
          ? 'flex h-control-lg w-full items-center gap-2 rounded-hero border border-white/25 bg-white/10 px-3 text-left text-base font-medium text-white transition-colors hover:bg-white/15'
          : 'flex h-control-lg w-full items-center gap-2 rounded-hero border border-input bg-background px-3 text-left text-base font-medium text-foreground'}
      >
        <MapPin className={onDark ? 'h-5 w-5 shrink-0 text-white' : 'h-5 w-5 shrink-0 text-primary'} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={label}
          onKeyDown={onListKeyDown}
          className="absolute left-0 top-full z-50 mt-2 max-h-[min(70vh,26rem)] w-full min-w-60 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-border bg-popover py-1.5 text-popover-foreground shadow-lg"
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
                className={`cursor-pointer px-3 py-2 outline-none ${i === active ? 'bg-muted' : ''}`}
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
      )}
    </div>
  )
}
