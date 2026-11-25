'use client'

import { useState } from 'react'
import { COPY } from '@/lib/copy'
import { pickedHints, type SearchHints } from '@/lib/search-hints'
import { FilterPicks } from '@/components/filter-picks'
import { IconButton } from '@/components/ui/icon-button'
import { SearchBar } from '@/components/search-bar'
import { SlidersHorizontal } from 'lucide-react'

/** /search uses the same bar and the same When, Budget, Vibe and Suburb picks as the hero. */
export function SearchPageForm({
  city,
  query,
  hints,
}: {
  city: string
  query: string
  hints: SearchHints
}) {
  const [q, setQ] = useState(query)
  const [picks, setPicks] = useState(hints)
  const [open, setOpen] = useState(pickedHints(hints))
  const count = [picks.when, picks.budget, picks.category, picks.area.trim()].filter(Boolean).length
  return (
    <div className="mt-6 max-w-3xl">
      <SearchBar
        id="search-q"
        name="q"
        action="/search"
        value={q}
        onChange={setQ}
        placeholder='Try "jazz this Friday"'
        label="Search events"
        hidden={[
          { name: 'city', value: city },
          { name: 'when', value: picks.when },
          { name: 'budget', value: picks.budget },
          { name: 'vibe', value: picks.category },
          { name: 'suburb', value: picks.area },
        ]}
        trailing={(
          <IconButton
            type="button"
            variant="ghost"
            aria-expanded={open}
            label={count ? `Filters, ${count} on` : 'Filters'}
            onClick={() => setOpen((value) => !value)}
            className={open ? 'relative bg-primary/15 text-primary' : 'relative'}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            {count > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-xs font-bold leading-none text-on-primary" aria-hidden>{count}</span>}
          </IconButton>
        )}
      />
      {open && (
        <div className="mt-3 rounded-hero bg-card p-4 text-card-foreground ring-1 ring-border">
          <FilterPicks surface="theme" hints={picks} onChange={setPicks} onClear={() => setPicks({ when: '', budget: '', category: '', area: '' })} />
        </div>
      )}
      {!q && !pickedHints(picks) && (
        <p className="mt-3 text-sm text-muted-foreground">Type a word, or pick a time, a budget or a vibe. {COPY.search} keeps the link.</p>
      )}
    </div>
  )
}
