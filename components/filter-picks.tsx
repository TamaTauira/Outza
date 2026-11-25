'use client'

import { ChevronDown, MapPin } from 'lucide-react'
import { CATEGORIES } from '@/lib/categories'
import { COPY } from '@/lib/copy'
import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/utils'
import { pickedHints, type Budget, type SearchHints, type When } from '@/lib/search-hints'

const WHEN_OPTS: { key: Exclude<When, ''>; label: string; hint: string }[] = [
  { key: 'soon', label: 'Soon', hint: 'Starting in the next 3 hours' },
  { key: 'tonight', label: 'Tonight', hint: 'From 5pm today' },
  { key: 'weekend', label: 'Weekend', hint: 'Saturday and Sunday' },
]

const BUDGET_OPTS: { key: Exclude<Budget, ''>; label: string }[] = [
  { key: 'free', label: 'Free' },
  { key: '30', label: 'Under $30' },
  { key: '75', label: 'Under $75' },
]

const fieldClass = 'h-control w-full rounded-full border border-border px-3.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'

/**
 * When, Budget, Vibe and Suburb. Home, Ask and /search share this panel.
 * A picked field is a ring, not a solid orange slab.
 */
export function FilterPicks({
  hints,
  onChange,
  onClear,
  idPrefix = 'picks',
  surface = 'light',
}: {
  hints: SearchHints
  onChange: (next: SearchHints) => void
  onClear: () => void
  idPrefix?: string
  /** `light` sits on the white hero card. `theme` follows the page, including a dark /search card. */
  surface?: 'light' | 'theme'
}) {
  const onLight = surface === 'light'
  const label = onLight ? 'text-[var(--vp-on-light)]' : 'text-muted-foreground'
  const field = cn(fieldClass, onLight ? 'bg-[var(--vp-on-light-fill)] text-[var(--vp-on-light)]' : 'bg-background text-foreground')
  const set = <K extends keyof SearchHints>(key: K, value: SearchHints[K]) => {
    const next = { ...hints, [key]: hints[key] === value && key !== 'area' ? '' : value } as SearchHints
    onChange(next)
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div role="group" aria-label="When" className="min-w-0">
        <div className={cn('vp-eyebrow mb-2', label)}>When</div>
        <div className="flex flex-wrap gap-2">
          {WHEN_OPTS.map((option) => (
            <Chip key={option.key} onLight={onLight} title={option.hint} pressed={hints.when === option.key} onClick={() => set('when', option.key)} className="justify-center px-3">
              {option.label}
            </Chip>
          ))}
        </div>
      </div>
      <div role="group" aria-label="Budget" className="min-w-0">
        <div className={cn('vp-eyebrow mb-2', label)}>Budget</div>
        <div className="flex flex-wrap gap-2">
          {BUDGET_OPTS.map((option) => (
            <Chip key={option.key} onLight={onLight} pressed={hints.budget === option.key} onClick={() => set('budget', option.key)} className="justify-center px-3">
              {option.label}
            </Chip>
          ))}
        </div>
      </div>
      <div className="min-w-0">
        <label htmlFor={`${idPrefix}-vibe`} className={cn('vp-eyebrow mb-2 block', label)}>Vibe</label>
        <span className="relative block">
          <select
            id={`${idPrefix}-vibe`}
            value={hints.category}
            onChange={(event) => onChange({ ...hints, category: event.target.value })}
            aria-label="Vibe"
            className={cn(field, 'appearance-none pr-8 text-left', hints.category && 'bg-primary/10 ring-2 ring-primary')}
          >
            <option value="">Any vibe</option>
            {CATEGORIES.map((category) => <option key={category.name} value={category.name}>{category.name}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-80" />
        </span>
      </div>
      <div className="min-w-0">
        <label htmlFor={`${idPrefix}-suburb`} className={cn('vp-eyebrow mb-2 block', label)}>Suburb</label>
        <span className="relative block">
          <MapPin className={cn('pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2', onLight ? 'text-[var(--vp-on-light)]' : 'text-muted-foreground')} />
          <input
            id={`${idPrefix}-suburb`}
            value={hints.area}
            onChange={(event) => onChange({ ...hints, area: event.target.value.slice(0, 40) })}
            maxLength={40}
            autoComplete="off"
            placeholder="Any suburb"
            className={cn(field, 'pl-9', hints.area.trim() && 'bg-primary/10 ring-2 ring-primary')}
          />
        </span>
      </div>
      {pickedHints(hints) && (
        <div className="flex justify-end sm:col-span-2">
          <button type="button" onClick={onClear} className={cn('inline-flex h-control items-center rounded-full px-3 text-sm font-semibold underline-offset-2 hover:underline', label)}>
            {COPY.clearPicks}
          </button>
        </div>
      )}
    </div>
  )
}
