'use client'

import { useState } from 'react'
import { X, Filter, ChevronDown, ChevronUp, Flag } from 'lucide-react'
import { CATEGORIES, SYDNEY_SUBURBS } from '@/lib/categories'
import { cn } from '@/lib/utils'

export interface FilterState {
  category: string
  subTag: string
  suburb: string
  isFree: boolean
  isLGBTI: boolean
  dateFrom: string
  dateTo: string
  datePreset: string
}

interface FilterPanelProps {
  filters: FilterState
  onChange: (filters: FilterState) => void
  onClose?: () => void
  isMobile?: boolean
}

export function FilterPanel({ filters, onChange, onClose, isMobile }: FilterPanelProps) {
  const [expandedCat, setExpandedCat] = useState<string>(filters.category)

  const update = (partial: Partial<FilterState>) => {
    onChange({ ...filters, ...partial })
  }

  const clearAll = () => {
    onChange({
      category: '', subTag: '', suburb: '',
      isFree: false, isLGBTI: false,
      dateFrom: '', dateTo: '', datePreset: '',
    })
  }

  const activeCount = [filters.category, filters.subTag, filters.suburb, filters.isFree, filters.isLGBTI, filters.datePreset || filters.dateFrom].filter(Boolean).length

  const setDatePreset = (preset: string) => {
    const now = new Date()
    let from = ''
    let to = ''

    if (preset === 'weekend') {
      const day = now.getDay()
      const daysToFri = day <= 5 ? 5 - day : 0
      const fri = new Date(now)
      fri.setDate(now.getDate() + daysToFri)
      const sun = new Date(fri)
      sun.setDate(fri.getDate() + 2)
      from = fri.toISOString().split('T')[0] ?? ''
      to = sun.toISOString().split('T')[0] ?? ''
    } else if (preset === 'week') {
      const end = new Date(now)
      end.setDate(now.getDate() + 7)
      from = now.toISOString().split('T')[0] ?? ''
      to = end.toISOString().split('T')[0] ?? ''
    } else if (preset === 'month') {
      const end = new Date(now)
      end.setDate(now.getDate() + 30)
      from = now.toISOString().split('T')[0] ?? ''
      to = end.toISOString().split('T')[0] ?? ''
    }

    update({ datePreset: preset, dateFrom: from, dateTo: to })
  }

  return (
    <div className={cn('bg-card rounded-xl p-4 space-y-5', isMobile && 'pb-8')}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-display font-semibold text-sm">Filters</h3>
          {activeCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">{activeCount}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground underline">Clear all</button>
          )}
          {onClose && (
            <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
          )}
        </div>
      </div>

      {/* Date presets */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">When</p>
        <div className="flex flex-wrap gap-1.5">
          {[{ key: 'weekend', label: 'This Weekend' }, { key: 'week', label: 'This Week' }, { key: 'month', label: 'This Month' }].map((p) => (
            <button
              key={p.key}
              onClick={() => setDatePreset(filters.datePreset === p.key ? '' : p.key)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                filters.datePreset === p.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => update({ dateFrom: e.target.value, datePreset: '' })}
            className="flex-1 px-2 py-1.5 rounded-lg border border-input bg-background text-xs"
          />
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => update({ dateTo: e.target.value, datePreset: '' })}
            className="flex-1 px-2 py-1.5 rounded-lg border border-input bg-background text-xs"
          />
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-2">
        <button
          onClick={() => update({ isFree: !filters.isFree })}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all',
            filters.isFree ? 'bg-free/15 text-free border border-free/30' : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          <span>🎉 Free Events Only</span>
          <span className="text-xs">{filters.isFree ? 'ON' : 'OFF'}</span>
        </button>

        <button
          onClick={() => update({ isLGBTI: !filters.isLGBTI })}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all',
            filters.isLGBTI
              ? 'rainbow-bg text-white border-0'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          <span>🏳️‍🌈 LGBTIQ+ Events</span>
          <span className="text-xs">{filters.isLGBTI ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {/* Categories */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Category</p>
        <div className="space-y-1">
          {CATEGORIES.map((cat) => (
            <div key={cat.name}>
              <button
                onClick={() => {
                  if (filters.category === cat.name) {
                    update({ category: '', subTag: '' })
                    setExpandedCat('')
                  } else {
                    update({ category: cat.name, subTag: '' })
                    setExpandedCat(cat.name)
                  }
                }}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all',
                  filters.category === cat.name
                    ? 'bg-primary/15 text-primary'
                    : 'hover:bg-muted text-foreground'
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                  {cat.name}
                </span>
                {cat.subTags.length > 0 && (
                  filters.category === cat.name ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                )}
              </button>

              {filters.category === cat.name && expandedCat === cat.name && (
                <div className="pl-5 pt-1 pb-1 flex flex-wrap gap-1">
                  {cat.subTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => update({ subTag: filters.subTag === tag ? '' : tag })}
                      className={cn(
                        'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                        filters.subTag === tag
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                      )}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Suburb */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Area</p>
        <select
          value={filters.suburb}
          onChange={(e) => update({ suburb: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
        >
          <option value="">All Areas</option>
          {SYDNEY_SUBURBS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
