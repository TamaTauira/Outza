'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bookmark, CalendarDays, ChevronDown, Heart, LayoutGrid, List, Map as MapIcon, Plus } from 'lucide-react'
import { FilterBar, filterChipClass } from '@/components/filter-bar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { LocalNeighbourhoodMap, type LocalMapPin } from '@/components/local-neighbourhood-map'
import { HeroCard } from '@/components/hero-card'
import { CityPicker } from '@/components/city-picker'
import { SearchBar } from '@/components/search-bar'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { sectionByKey } from '@/lib/community-shared'
import { categoryIcon, dayLabel } from '@/lib/board'
import { listPriceLabel } from '@/lib/price'
import { formatBoardRange } from '@/lib/listing-window'
import { listPlaceLine } from '@/components/list-clock'
import { fmtTime, localFeedSaveId } from '@/lib/local-shared'
import { EventImage } from '@/components/event-image'
import { LOCAL_TILES, localTileFor, type LocalTile } from '@/lib/local-tiles'
import type { PlaceholderSlot } from '@/lib/placeholders'
import { citySlug } from '@/lib/seo'
import { cn } from '@/lib/utils'
import { ItineraryButton } from '@/components/itinerary-button'
import { ListingBoardCard } from '@/components/listing-board-card'
import { BoardHeadings, BoardRow, GroupBar, getStatus, type BoardEvent } from '@/components/board-row'

export type LocalItem = {
  id: string
  title: string
  section: string
  suburb: string
  city: string
  date: string
  time: string | null
  endTime?: string | null
  isFree: boolean
  price: string | null
  href: string
  kind?: string
  status?: string | null
  lat?: number | null
  lng?: number | null
  blurb?: string | null
  imageUrl?: string | null
}

const PREVIEW = 4
const ACCENT: Record<string, string> = {
  'garage-sales': '#c2410c',
  'warehouse-sales': '#be123c',
  'school-fundraisers': '#db2777',
  'farmers-markets': '#15803d',
  'neighbourhood-popups': '#ea580c',
  'community-sport': '#0369a1',
  'community-events': '#0f766e',
  'charity-events': '#be185d',
  'dog-friendly': '#b45309',
  'local-art': '#7c3aed',
}

const rowKey = (ev: LocalItem) => `${ev.kind ?? 'row'}:${ev.id}:${ev.date}`

function clock(time: string | null) {
  if (!time || !/^\d{1,2}:\d{2}/.test(time)) return ''
  return fmtTime(time)
}

function ListingPicture({ ev, slot, className, alt, priority }: { ev: LocalItem; slot: PlaceholderSlot; className?: string; alt?: string; priority?: boolean }) {
  const kind = slot === 'hero' || slot === 'featured' || slot === 'square' ? slot : 'card'
  return (
    <span className={cn('relative block overflow-hidden bg-[#110e16]', className)}>
      <EventImage src={ev.imageUrl} category={ev.section} slot={slot} kind={kind} alt={alt || ''} sizes={slot === 'hero' ? '(min-width: 1024px) 520px, 100vw' : '(min-width: 1024px) 280px, 45vw'} crop={!!ev.imageUrl} priority={priority} />
    </span>
  )
}

function MascotFrame({ tile, className }: { tile: LocalTile | null; className?: string }) {
  if (!tile?.src || !tile.srcSmall) {
    return (
      <span className={cn('grid place-items-center bg-primary/10 text-primary', className)}>
        <Heart className="h-6 w-6" aria-hidden />
      </span>
    )
  }
  return (
    <span className={cn('relative block overflow-hidden bg-card', className)}>
      <picture>
        <source srcSet={tile.srcSmall} media="(max-width: 640px)" />
        <img src={tile.src} alt={tile.alt} className="absolute inset-0 h-full w-full object-contain object-center" />
      </picture>
    </span>
  )
}

function dayHeading(day: string, today: string | null, count: number) {
  return `${dayLabel(day, today)} · ${count} ${count === 1 ? 'event' : 'events'}`
}

function priceLine(ev: LocalItem) {
  if (ev.isFree) return <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-bold text-white">Free</span>
  if (ev.price) return <span className="font-mono text-xs text-foreground">{ev.price}</span>
  return null
}

export function LocalBrowse({
  city, setCity, query, setQuery, applyQuery, appliedQuery, suburb, setSuburb, category, setCategory, when, setWhen,
  items, error, onRetry, days, pins, today, hotKey, setHotKey, focusKey, focusPin,
  closed, setClosed, more, setMore, isSaved, save, onList, onMine, onHow, hasListings, nowMinutes,
}: {
  city: string
  setCity: (city: string) => void
  query: string
  setQuery: (query: string) => void
  applyQuery: (query: string) => void
  appliedQuery: string
  suburb: string
  setSuburb: (suburb: string) => void
  category: string
  setCategory: (category: string) => void
  when: string
  setWhen: (when: string) => void
  items: LocalItem[] | null
  error: string | null
  onRetry?: () => void
  days: [string, LocalItem[]][]
  pins: LocalMapPin[]
  today: string | null
  hotKey: string | null
  setHotKey: (key: string | null) => void
  focusKey: string | null
  focusPin: (key: string) => void
  closed: Record<string, boolean>
  setClosed: (next: Record<string, boolean> | ((current: Record<string, boolean>) => Record<string, boolean>)) => void
  more: Record<string, boolean>
  setMore: (next: Record<string, boolean> | ((current: Record<string, boolean>) => Record<string, boolean>)) => void
  isSaved: (id: string) => boolean
  save: (ev: LocalItem) => void
  onList: () => void
  onMine: () => void
  onHow: () => void
  hasListings: boolean
  nowMinutes: number
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'board' | 'map' | 'list'>('list')
  const [sort, setSort] = useState<'soon' | 'name'>('soon')
  const [calOpen, setCalOpen] = useState(false)
  const pickedDate = /^\d{4}-\d{2}-\d{2}$/.test(when)
  const whenLabel = when === 'today' ? 'today' : when === 'tonight' ? 'tonight' : when === 'weekend' ? 'this weekend' : pickedDate ? new Date(`${when}T12:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'soon'
  const searching = appliedQuery.trim()
  const filtered = category || suburb || query.trim() || searching || when !== 'weekend'
  const clearQuery = () => { setQuery(''); applyQuery('') }
  const reset = () => { setCategory(''); clearQuery(); setSuburb(''); setWhen('weekend') }
  const featured = useMemo(() => {
    const pool = items ?? []
    const picks: LocalItem[] = []
    const seen = new Set<string>()
    for (const ev of pool) {
      if (seen.has(ev.section)) continue
      seen.add(ev.section)
      picks.push(ev)
      if (picks.length === 4) return picks
    }
    for (const ev of pool) {
      if (picks.some((pick) => pick.id === ev.id && pick.date === ev.date)) continue
      picks.push(ev)
      if (picks.length === 4) break
    }
    return picks
  }, [items])
  const ordered = useMemo(() => days.map(([day, rows]) => [day, sort === 'name' ? [...rows].sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base', ignorePunctuation: true })) : rows] as [string, LocalItem[]]), [days, sort])

  const pick = (key: string) => setCategory(category === key ? '' : key)
  const openListing = (href: string) => router.push(href || '/local', { scroll: false })
  const reveal = (key: string) => {
    setMode('board')
    focusPin(key)
  }

  return (
    <div className="min-w-0">
      <HeroCard
        image="/local/market-hero.jpg"
        title={<><span className="block">Good things are happening</span><span className="vp-gradient-line block text-brand-gradient">around the corner.</span></>}
        lede="From weekend markets to neighbourhood garage sales, take a peep at what’s happening near you."
      >
        <div className="mt-5 grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
          <CityPicker value={city} onChange={setCity} onDark label="City" />
          <SearchBar value={query} onChange={setQuery} onSubmit={() => applyQuery(query)} placeholder="Markets, weekends" label={`Search names, places, dates and free events in ${city}`} />
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={onList} className="inline-flex h-11 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">Add yours</button>
          {hasListings && <button type="button" onClick={onMine} className="inline-flex h-11 items-center rounded-full bg-white/15 px-4 text-sm font-semibold text-white">Your listings</button>}
          <button type="button" onClick={onHow} className="inline-flex h-11 items-center rounded-full bg-white/10 px-4 text-sm font-semibold text-white">How it works</button>
        </div>
      </HeroCard>

      <section className="relative mt-section" aria-labelledby="local-categories">
        <div className="flex items-end justify-between gap-3">
          <h2 id="local-categories" className="font-display text-h2">What’s your kind of local?</h2>
        </div>
        <div className="relative mt-4">
          <div className="flex snap-x snap-mandatory gap-[var(--vp-card-gap)] overflow-x-auto pb-1 [scrollbar-width:none] [mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)] min-[1100px]:grid min-[1100px]:snap-none min-[1100px]:grid-cols-10 min-[1100px]:overflow-visible min-[1100px]:[mask-image:none] [&::-webkit-scrollbar]:hidden">
            {LOCAL_TILES.map((tile) => (
              <CategoryButton key={tile.key} tile={tile} on={category === tile.key} onPick={() => pick(tile.key)} />
            ))}
          </div>
        </div>
      </section>

      <section className="relative mt-section" aria-labelledby="local-finds">
        <h2 id="local-finds" className="font-display text-h2">Little local finds.</h2>
        <p className="mt-1 text-muted-foreground">Four picks. Swipe across, then the full list is below.</p>
        {!items && !error && <div className="mt-4 flex gap-3 overflow-hidden">{[0, 1, 2, 3].map((i) => <div key={i} className="h-64 w-[78vw] max-w-[280px] shrink-0 animate-pulse rounded-2xl bg-muted" />)}</div>}
        {error && (
          <div className="mt-4 rounded-2xl bg-card p-6 text-sm text-muted-foreground">
            <p>{error}</p>
            {onRetry && <button type="button" onClick={onRetry} className="mt-3 inline-flex h-11 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">Try again</button>}
          </div>
        )}
        {items && !items.length && !error && searching && <SearchEmpty query={searching} city={city} onClear={clearQuery} onList={onList} />}
        {items && !items.length && !error && !searching && (
          <div className="mt-4 rounded-2xl border border-border bg-card p-6">
            <p className="font-display text-lg font-bold">Nothing listed{category ? ` under ${localTileFor(category)?.label ?? 'that'}` : ''} for {city} {whenLabel} yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">Try a wider window, or be the neighbour who puts the first thing on the noticeboard.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => { setCategory(''); setWhen('30') }} className="h-11 rounded-full bg-muted px-4 text-sm font-semibold">Widen the search</button>
              <button type="button" onClick={onList} className="h-11 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">Add yours</button>
            </div>
          </div>
        )}
        {!!featured.length && (
          <div className="relative mt-4">
            <div className={cn('flex snap-x gap-[var(--vp-card-gap)] overflow-x-auto pb-2 [scrollbar-width:none] lg:grid lg:overflow-visible [&::-webkit-scrollbar]:hidden', featured.length >= 4 ? 'lg:grid-cols-4' : featured.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2')}>
              {featured.map((ev) => (
                <article key={rowKey(ev)} onClick={(event) => { if ((event.target as HTMLElement).closest('a,button')) return; openListing(ev.href) }} className="flex w-[78vw] max-w-[280px] shrink-0 cursor-pointer snap-start flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:w-auto lg:max-w-none">
                  <Link href={ev.href || '/local'} scroll={false} className="block">
                    <ListingPicture ev={ev} slot="hero" className="aspect-video" alt={ev.title} />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col p-4" style={{ borderTop: `3px solid ${ACCENT[ev.section] ?? '#ea580c'}` }}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{sectionByKey(ev.section)?.short ?? 'Local'}</p>
                    <Link href={ev.href || '/local'} scroll={false} className="mt-1 font-display text-lg font-bold leading-snug line-clamp-2 hover:text-primary">{ev.title}</Link>
                    <p className="mt-1 text-sm text-muted-foreground">{[ev.suburb, dayLabel(ev.date, today), clock(ev.time)].filter(Boolean).join(' · ')}</p>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                      {priceLine(ev)}
                      <span className="flex shrink-0 items-center">
                        <SaveButton saved={isSaved(localFeedSaveId(ev))} onClick={() => save(ev)} />
                        <LocalPlus ev={ev} />
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      <section id="local-board" className="vp-local-grid mt-section scroll-mt-24" aria-labelledby="local-results">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="local-results" tabIndex={-1} className="font-display text-h2 outline-none">Your weekend, laid out.</h2>
            <p className="mt-1 text-muted-foreground">Everything happening around you. All in one place.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 px-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <SegmentedControl
            value={mode}
            onChange={setMode}
            label="Local board view"
            options={[{ key: 'list', text: 'List', Icon: List }, { key: 'board', text: 'Board', Icon: LayoutGrid }, { key: 'map', text: 'Map', Icon: MapIcon }]}
          />
          <div className="flex gap-2">
            {mode === 'list' && (
              <select value={sort} onChange={(event) => setSort(event.target.value === 'name' ? 'name' : 'soon')} aria-label="Sort the list" className="h-11 rounded-full border border-border bg-card px-3 text-sm">
                <option value="soon">Soonest</option>
                <option value="name">Name</option>
              </select>
            )}
            {filtered && <button type="button" onClick={reset} className="h-11 shrink-0 rounded-full px-3 text-sm font-semibold text-primary">Reset</button>}
          </div>
        </div>
        <div className="mt-2">
          <FilterBar
            dates={[
              { key: 'today', label: 'Today', pressed: when === 'today', onClick: () => setWhen('today') },
              { key: 'tonight', label: 'Tonight', pressed: when === 'tonight', onClick: () => setWhen('tonight') },
              { key: 'weekend', label: 'This weekend', pressed: when === 'weekend', onClick: () => setWhen('weekend') },
            ]}
            picker={(
              <Popover open={calOpen} onOpenChange={setCalOpen}>
                <PopoverTrigger asChild>
                  <button type="button" aria-pressed={pickedDate} className={filterChipClass(pickedDate)}>
                    <CalendarDays className="h-4 w-4" /> {pickedDate ? whenLabel : 'Pick a date'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={pickedDate ? new Date(`${when}T12:00:00`) : undefined}
                    disabled={today ? { before: new Date(`${today}T00:00:00`) } : undefined}
                    onSelect={(d) => {
                      if (!d) return
                      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                      setWhen(iso)
                      setCalOpen(false)
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            )}
            searchId="local-board-search"
            searchValue={query}
            onSearch={setQuery}
            onClear={clearQuery}
            searchPlaceholder="Search listings"
            searchLabel="Search local listings"
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground" aria-live="polite"><span className="font-semibold text-foreground">{items ? items.length : '…'}</span> listings · {whenLabel}{suburb ? ` · ${suburb}` : ''}{category ? ` · ${localTileFor(category)?.label ?? category}` : ''}{searching ? ` · “${searching}”` : ''}</p>

        {mode === 'map' && (
          <div className="mt-3 h-[28rem] sm:h-[36rem]">
            <LocalNeighbourhoodMap pins={pins} city={city} hotKey={hotKey} focusKey={focusKey} onHot={setHotKey} onFocus={reveal} onCity={setCity} loading={!items && !error} className="h-full" />
          </div>
        )}

        {mode !== 'map' && error && (
          <div className="mt-4 rounded-2xl bg-card p-6 text-sm">
            <p>{error}</p>
            {onRetry && <button type="button" onClick={onRetry} className="mt-3 inline-flex h-11 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">Try again</button>}
          </div>
        )}
        {mode !== 'map' && !items && !error && <div className="mt-4 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>}
        {mode !== 'map' && items && !items.length && !error && searching && <SearchEmpty query={searching} city={city} onClear={clearQuery} onList={onList} centered />}
        {mode !== 'map' && items && !items.length && !error && !searching && (
          <div className="mt-4 rounded-2xl border border-border bg-card p-6">
            <p className="font-display text-h3">Nothing listed{category ? ` under ${localTileFor(category)?.label ?? 'that'}` : ''} for {city} {whenLabel} yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">Try a wider window, or be the neighbour who puts the first thing on the noticeboard.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => { setCategory(''); setWhen('30') }} className="h-11 rounded-full bg-muted px-4 text-sm font-semibold">Widen the search</button>
              <button type="button" onClick={onList} className="h-11 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">Add yours</button>
            </div>
          </div>
        )}
        {mode !== 'map' && items && !items.length && !error && !searching && (
          <div className="mt-4 rounded-2xl border border-border bg-card p-8 text-center">
            <p className="font-display text-lg font-bold">The noticeboard’s quiet for {city} {whenLabel}.</p>
            <p className="mt-1 text-sm text-muted-foreground">Clear a filter, open Peep, or list the thing you already know about.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => { setCategory(''); setWhen('30') }} className="h-11 rounded-full bg-muted px-4 text-sm font-semibold">Next 30 days</button>
              <Link href={`/${citySlug(city)}`} className="inline-flex h-11 items-center rounded-full bg-muted px-4 text-sm font-semibold">Back to what’s on</Link>
            </div>
          </div>
        )}

        {mode === 'board' && ordered.map(([day, rows]) => {
          const open = !closed[day]
          const shown = more[day] ? rows : rows.slice(0, PREVIEW)
          const hidden = rows.length - shown.length
          return (
            <div key={day} className="mt-4">
              <button type="button" onClick={() => setClosed((current) => ({ ...current, [day]: open }))} className="flex w-full items-center gap-3 rounded-xl bg-primary/[0.08] px-3 py-2.5 text-left" aria-expanded={open}>
                <span className="text-sm font-semibold">{dayHeading(day, today, rows.length)}</span>
                <ChevronDown className={cn('ml-auto h-4 w-4 text-primary transition-transform', !open && '-rotate-90')} />
              </button>
              {open && (
                <div className="vp-board-grid is-local mt-2">
                  {shown.map((ev) => <BoardCard key={rowKey(ev)} ev={ev} hot={hotKey === rowKey(ev) || focusKey === rowKey(ev)} onHot={setHotKey} saved={isSaved(localFeedSaveId(ev))} onSave={() => save(ev)} onOpen={() => openListing(ev.href)} />)}
                </div>
              )}
              {open && hidden > 0 && <button type="button" onClick={() => setMore((current) => ({ ...current, [day]: true }))} className="mt-2 text-sm font-semibold text-primary">Show {hidden} more {hidden === 1 ? 'event' : 'events'}</button>}
            </div>
          )
        })}

        {mode === 'list' && (
          <div className="mt-4 rounded-xl border border-border bg-card shadow-[0_20px_50px_-30px_rgba(0,0,0,0.6)]">
            <BoardHeadings />
            {ordered.map(([day, rows]) => {
              const open = !closed[day]
              const shown = more[day] ? rows : rows.slice(0, PREVIEW)
              const hidden = rows.length - shown.length
              return (
                <div key={day}>
                  <GroupBar pin="page" label={dayLabel(day, today)} count={rows.length} open={open} onToggle={() => setClosed((current) => ({ ...current, [day]: open }))} />
                  {open && shown.map((ev) => {
                    const key = rowKey(ev)
                    const board = toBoardEvent(ev)
                    return (
                      <div key={key} data-row={key} onMouseEnter={() => setHotKey(key)} onMouseLeave={() => setHotKey(null)}>
                        <BoardRow
                          ev={board}
                          status={getStatus(board, ev.date, today, nowMinutes)}
                          saved={isSaved(localFeedSaveId(ev))}
                          onToggleSave={() => save(ev)}
                          active={hotKey === key || focusKey === key}
                          wrapTitle
                        />
                      </div>
                    )
                  })}
                  {open && hidden > 0 && <button type="button" onClick={() => setMore((current) => ({ ...current, [day]: true }))} className="w-full border-t border-border px-3 py-3 text-left text-sm font-semibold text-primary">Show {hidden} more {hidden === 1 ? 'event' : 'events'}</button>}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="mt-12 rounded-3xl bg-gradient-to-br from-primary/15 via-card to-accent/15 p-6 sm:p-8">
        <h2 className="font-display text-2xl font-bold">Got something happening?</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">Big community event or little neighbourhood find? There’s a place for it on VibePeep. Garage sales, fundraisers, school fetes, markets and pop-ups are all welcome, and it’s free to add yours.</p>
        <button type="button" onClick={onList} className="mt-4 inline-flex h-12 items-center gap-1.5 rounded-full bg-primary px-5 text-base font-semibold text-primary-foreground">
          <Plus className="h-4 w-4" />List your thing free
        </button>
      </section>
    </div>
  )
}

function SearchEmpty({ query, city, onClear, onList, centered }: { query: string; city: string; onClear: () => void; onList: () => void; centered?: boolean }) {
  return (
    <div className={cn('mt-4 rounded-2xl border border-border bg-card p-6', centered && 'p-8 text-center')}>
      <p className="font-display text-lg font-bold">Nothing on the local board matches “{query}” in {city}.</p>
      <p className="mt-1 text-sm text-muted-foreground">Clear the search to see what’s listed here.</p>
      <div className={cn('mt-4 flex flex-wrap gap-2', centered && 'justify-center')}>
        <button type="button" onClick={onClear} className="h-11 rounded-full bg-muted px-4 text-sm font-semibold">Clear search</button>
        <button type="button" onClick={onList} className="h-11 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">Add yours</button>
      </div>
    </div>
  )
}

function CategoryButton({ tile, on, onPick }: { tile: LocalTile; on: boolean; onPick: () => void }) {
  return (
    <button type="button" aria-pressed={on} aria-label={tile.label} onClick={onPick} className={cn('flex w-[8.5rem] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition min-[1100px]:h-full min-[1100px]:w-auto min-[1100px]:min-w-0', on && 'ring-2 ring-primary ring-offset-2 ring-offset-background')}>
      <MascotFrame tile={tile} className="aspect-[5/4] w-full shrink-0" />
      <span className="flex min-h-control items-center justify-center px-1 text-center text-caption font-semibold leading-tight">{tile.label}</span>
    </button>
  )
}

function toBoardEvent(ev: LocalItem): BoardEvent {
  const label = sectionByKey(ev.section)?.short ?? 'Local'
  return {
    id: ev.id,
    title: ev.title,
    description: ev.blurb ?? null,
    date: ev.date,
    endDate: null,
    time: ev.time,
    endTime: ev.endTime ?? null,
    venueName: ev.suburb || ev.title,
    suburb: null,
    category: sectionByKey(ev.section)?.boardCategory ?? 'Community',
    subTags: [label],
    isLGBTI: false,
    isFree: ev.isFree,
    price: ev.price,
    ticketUrl: null,
    city: ev.city,
    latitude: ev.lat ?? null,
    longitude: ev.lng ?? null,
    status: ev.status,
    href: ev.href || '/local',
    imageUrl: ev.imageUrl,
  }
}

function BoardCard({ ev, hot, onHot, saved, onSave, onOpen }: { ev: LocalItem; hot: boolean; onHot: (key: string | null) => void; saved: boolean; onSave: () => void; onOpen: () => void }) {
  const section = sectionByKey(ev.section)
  const status = ev.status === 'CANCELLED' ? 'Cancelled' : ev.status === 'POSTPONED' ? 'Postponed' : ''
  const when = formatBoardRange({ date: ev.date, time: ev.time, endTime: ev.endTime, city: ev.city })
  const price = listPriceLabel(ev.isFree, ev.price)
  const place = listPlaceLine([ev.suburb, status].filter(Boolean).join(' · '), when.endNote)
  return (
    <ListingBoardCard
      rowId={rowKey(ev)}
      title={ev.title}
      href={ev.href || '/local'}
      imageUrl={ev.imageUrl}
      imageCategory={ev.section}
      venue={place}
      tag={section?.short ?? 'Local'}
      accent={ACCENT[ev.section] ?? '#ea580c'}
      priceText={price.text}
      priceKind={price.kind}
      when={when}
      icon={categoryIcon(section?.boardCategory ?? 'Community')}
      hot={hot}
      onHot={(on) => onHot(on ? rowKey(ev) : null)}
      onOpen={onOpen}
      actions={(
        <>
          <SaveButton saved={saved} onClick={onSave} />
          <LocalPlus ev={ev} />
        </>
      )}
    />
  )
}

function SaveButton({ saved, onClick }: { saved: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClick() }} aria-pressed={saved} aria-label={saved ? 'Remove from saved' : 'Save'} className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-full', saved ? 'text-primary' : 'text-muted-foreground')}>
      <Bookmark className={cn('h-4 w-4', saved && 'fill-current')} />
    </button>
  )
}

function LocalPlus({ ev }: { ev: LocalItem }) {
  return (
    <ItineraryButton
      lineup
      surface="local"
      event={{
        id: ev.id,
        title: ev.title,
        date: ev.date,
        time: ev.time,
        venueName: ev.suburb || ev.title,
        suburb: ev.suburb,
        city: ev.city,
        href: ev.href || '/local',
        lat: ev.lat,
        lng: ev.lng,
        imageUrl: ev.imageUrl,
      }}
      className="grid h-11 w-11 place-items-center rounded-full p-0"
    />
  )
}
