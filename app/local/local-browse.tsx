'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Bookmark, ChevronDown, Heart, LayoutGrid, List, Map as MapIcon, MapPin, Plus, Search } from 'lucide-react'
import { LocalNeighbourhoodMap, type LocalMapPin } from '@/components/local-neighbourhood-map'
import { CITIES } from '@/lib/cities'
import { LocalClock } from '@/components/local-clock'
import { sectionByKey } from '@/lib/community-shared'
import { dayLabel } from '@/lib/board'
import { fmtTime } from '@/lib/local-shared'
import { EventImage } from '@/components/event-image'
import { localTileFor, moreTiles, primaryTiles, type LocalTile } from '@/lib/local-tiles'
import type { PlaceholderSlot } from '@/lib/placeholders'
import { citySlug } from '@/lib/seo'
import { cn } from '@/lib/utils'

export type LocalItem = {
  id: string
  title: string
  section: string
  suburb: string
  city: string
  date: string
  time: string | null
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

const WHEN = [
  { key: 'today', label: 'Today' },
  { key: 'weekend', label: 'This weekend' },
  { key: '7', label: 'Next 7 days' },
  { key: '30', label: 'Next 30 days' },
] as const

const PREVIEW = 5
const ACCENT: Record<string, string> = {
  'garage-sales': '#c2410c',
  'warehouse-sales': '#be123c',
  'school-fundraisers': '#db2777',
  'farmers-markets': '#15803d',
  'neighbourhood-popups': '#ea580c',
  'community-sport': '#0369a1',
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
      <EventImage src={ev.imageUrl} category={ev.section} slot={slot} wideSlot={slot === 'hero' ? 'hero-wide' : undefined} kind={kind} alt={alt || ''} sizes={slot === 'hero' ? '(min-width: 1024px) 520px, 100vw' : '(min-width: 1024px) 280px, 45vw'} crop={!!ev.imageUrl} priority={priority} />
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
    <span className={cn('relative block overflow-hidden bg-white', className)}>
      <picture>
        <source srcSet={tile.srcSmall} media="(max-width: 640px)" />
        <img src={tile.src} alt={tile.alt} className="absolute inset-0 h-full w-full object-contain object-center" />
      </picture>
    </span>
  )
}

function priceLine(ev: LocalItem) {
  if (ev.isFree) return <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[11px] font-bold text-white">Free</span>
  if (ev.price) return <span className="font-mono text-xs text-foreground">{ev.price}</span>
  return null
}

export function LocalBrowse({
  city, setCity, suburb, setSuburb, applySuburb, category, setCategory, when, setWhen,
  items, error, days, pins, weekend, today, hotKey, setHotKey, focusKey, focusPin,
  closed, setClosed, more, setMore, isSaved, save, onList,
}: {
  city: string
  setCity: (city: string) => void
  suburb: string
  setSuburb: (suburb: string) => void
  applySuburb: (suburb: string) => void
  category: string
  setCategory: (category: string) => void
  when: string
  setWhen: (when: string) => void
  items: LocalItem[] | null
  error: string | null
  days: [string, LocalItem[]][]
  pins: LocalMapPin[]
  weekend: LocalItem[] | null
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
}) {
  const [seeAll, setSeeAll] = useState(false)
  const [mode, setMode] = useState<'board' | 'map' | 'list'>('board')
  const [sort, setSort] = useState<'soon' | 'name'>('soon')
  const whenLabel = WHEN.find((item) => item.key === when)?.label.toLowerCase() ?? 'soon'
  const filtered = category || suburb || when !== 'weekend'
  const featured = (items ?? []).slice(0, 4)
  const heroChips = [
    { key: 'farmers-markets', label: 'Markets' },
    { key: 'garage-sales', label: 'Garage sales' },
    { key: 'school-fundraisers', label: 'Fetes' },
    { key: 'neighbourhood-popups', label: 'Pop-ups' },
  ]
  const ordered = useMemo(() => days.map(([day, rows]) => [day, sort === 'name' ? [...rows].sort((a, b) => a.title.localeCompare(b.title)) : rows] as [string, LocalItem[]]), [days, sort])
  const weekendDays = useMemo(() => {
    const grouped = new Map<string, LocalItem[]>()
    ;(weekend ?? []).forEach((item) => grouped.set(item.date, [...(grouped.get(item.date) ?? []), item]))
    return [...grouped.entries()]
  }, [weekend])

  const pick = (key: string) => setCategory(category === key ? '' : key)
  const reveal = (key: string) => {
    setMode('board')
    focusPin(key)
  }

  return (
    <div className="mt-6 min-w-0">
      <header className="relative overflow-hidden rounded-3xl bg-[#0c0f0e] px-4 py-6 text-white shadow-[0_20px_50px_-30px_rgba(0,0,0,0.6)] sm:px-8 sm:py-8">
        <img src="/local/market-hero.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/45" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-[2rem] font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              <span className="block">Good things are happening</span>
              <span className="block text-brand-gradient">around the corner.</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm text-white/80 sm:text-lg">From weekend markets to neighbourhood garage sales, take a peep at what’s happening near you.</p>
          </div>
          <LocalClock city={city} className="vp-hero-clock shrink-0 text-right" />
        </div>
        <form className="relative mt-5 grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start" onSubmit={(event) => { event.preventDefault(); applySuburb(suburb) }}>
          <label className="inline-flex h-14 items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-3">
            <MapPin className="h-4 w-4 shrink-0 text-primary" />
            <span className="sr-only">Choose a city</span>
            <select value={city} onChange={(event) => setCity(event.target.value)} className="min-w-0 flex-1 cursor-pointer bg-transparent font-medium text-white focus:outline-none" aria-label="City">
              {CITIES.map((item) => <option key={item.name} value={item.name} className="bg-popover text-popover-foreground">{item.name}, {item.state}</option>)}
            </select>
          </label>
          <div className="flex min-w-0 items-center gap-2 rounded-xl bg-white p-1.5 text-neutral-900 shadow-[0_10px_30px_-12px_rgba(232,85,63,0.55)] ring-2 ring-primary/50">
            <Search className="ml-2 h-4 w-4 shrink-0 text-primary" />
            <input value={suburb} onChange={(event) => setSuburb(event.target.value)} placeholder="Suburb" aria-label="Suburb" className="h-11 min-w-0 flex-1 bg-transparent px-1 text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none" />
            <button type="submit" className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
              <Search className="h-4 w-4" />Search
            </button>
          </div>
        </form>
        <div className="relative mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {heroChips.map((chip) => (
            <button key={chip.key} type="button" aria-pressed={category === chip.key} onClick={() => pick(chip.key)} className="h-10 shrink-0 rounded-full bg-white/10 px-3 text-sm font-medium text-white hover:bg-white/20 aria-pressed:bg-white aria-pressed:text-neutral-900">
              {chip.label}
            </button>
          ))}
        </div>
      </header>
      <button type="button" onClick={onList} className="mt-3 inline-flex h-11 items-center gap-1.5 text-sm font-semibold text-primary">
        <Plus className="h-4 w-4" />List your thing free
      </button>

      <section className="mt-10" aria-labelledby="local-categories">
        <div className="flex items-end justify-between gap-3">
          <h2 id="local-categories" className="font-display text-2xl font-bold">What’s your kind of local?</h2>
        </div>
        <div className="-mx-4 mt-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-7 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
          {primaryTiles().map((tile) => (
            <CategoryButton key={tile.key} tile={tile} on={category === tile.key} onPick={() => pick(tile.key)} />
          ))}
          <button type="button" aria-expanded={seeAll} onClick={() => setSeeAll((open) => !open)} className="flex h-auto w-[9.5rem] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card px-3 py-4 text-sm font-semibold lg:w-auto">
            {seeAll ? 'Show fewer' : 'See all'}
            <span className="text-xs font-normal text-muted-foreground">Clearance, dogs, art</span>
          </button>
        </div>
        {seeAll && (
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] lg:grid lg:grid-cols-7 [&::-webkit-scrollbar]:hidden">
            {moreTiles().map((tile) => (
              <CategoryButton key={tile.key} tile={tile} on={category === tile.key} onPick={() => pick(tile.key)} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10" aria-labelledby="local-finds">
        <h2 id="local-finds" className="font-display text-2xl font-bold">Little local finds.</h2>
        {!items && !error && <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-48 animate-pulse rounded-2xl bg-muted" />)}</div>}
        {error && <p className="mt-4 rounded-2xl bg-card p-6 text-sm text-muted-foreground">{error}</p>}
        {items && !items.length && !error && (
          <div className="mt-4 rounded-2xl border border-border bg-card p-6">
            <p className="font-display text-lg font-bold">Nothing listed{category ? ` under ${localTileFor(category)?.label ?? 'that'}` : ''} for {city} {whenLabel} yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">Try a wider window, or be the neighbour who puts the first thing on the noticeboard.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => { setCategory(''); setWhen('30') }} className="h-11 rounded-full bg-muted px-4 text-sm font-semibold">Widen the search</button>
              <button type="button" onClick={onList} className="h-11 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">List your thing free</button>
            </div>
          </div>
        )}
        {!!featured.length && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((ev, index) => (
              <article key={rowKey(ev)} className={cn('flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm', index === 0 && 'sm:col-span-2 lg:row-span-2')}>
                <ListingPicture ev={ev} slot={index === 0 ? 'featured' : 'card'} className={index === 0 ? 'h-48 sm:h-56' : 'h-40'} alt={ev.title} />
                <div className="flex min-w-0 flex-1 flex-col p-4" style={{ borderTop: `3px solid ${ACCENT[ev.section] ?? '#ea580c'}` }}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{sectionByKey(ev.section)?.short ?? 'Local'}</p>
                  <Link href={ev.href || '/local'} className="mt-1 font-display text-lg font-bold leading-snug hover:text-primary">{ev.title}</Link>
                  <p className="mt-1 text-sm text-muted-foreground">{[ev.suburb, dayLabel(ev.date, today), clock(ev.time)].filter(Boolean).join(' · ')}</p>
                  {ev.blurb && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{ev.blurb}</p>}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                    <span className="flex items-center gap-2">{priceLine(ev)}<Link href={ev.href || '/local'} className="text-sm font-semibold text-primary">Take a look</Link></span>
                    <SaveButton saved={isSaved(ev.id)} onClick={() => save(ev)} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section id="local-board" className="vp-local-grid mt-12 scroll-mt-24" aria-labelledby="local-board-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="local-board-title" className="font-display text-2xl font-bold">Your weekend, laid out.</h2>
            <p className="mt-1 text-muted-foreground">Everything happening around you. All in one place.</p>
          </div>
          <Link href="/" className="text-sm font-semibold text-primary">Open the full Board</Link>
        </div>
        <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-1 rounded-full bg-muted p-1" role="tablist" aria-label="Local board view">
            {([['board', 'Board', LayoutGrid], ['map', 'Map', MapIcon], ['list', 'List', List]] as const).map(([key, label, Icon]) => (
              <button key={key} type="button" role="tab" aria-selected={mode === key} onClick={() => setMode(key)} className={cn('inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold lg:flex-none', mode === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </div>
          <div className="flex min-w-0 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {WHEN.map((item) => (
              <button key={item.key} type="button" onClick={() => setWhen(item.key)} className={cn('h-11 shrink-0 rounded-full px-4 text-sm font-medium', when === item.key ? 'bg-foreground text-background' : 'border border-border bg-card')}>{item.label}</button>
            ))}
            {mode === 'list' && (
              <select value={sort} onChange={(event) => setSort(event.target.value === 'name' ? 'name' : 'soon')} aria-label="Sort the list" className="h-11 rounded-full border border-border bg-card px-3 text-sm">
                <option value="soon">Soonest</option>
                <option value="name">Name</option>
              </select>
            )}
            {filtered && <button type="button" onClick={() => { setCategory(''); setSuburb(''); applySuburb(''); setWhen('weekend') }} className="h-11 shrink-0 rounded-full px-3 text-sm font-semibold text-primary">Reset</button>}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground"><span className="font-semibold text-foreground">{items ? items.length : '…'}</span> listings · {whenLabel}{suburb ? ` · ${suburb}` : ''}</p>

        {mode === 'map' && (
          <div className="mt-3 h-[28rem] sm:h-[36rem]">
            <LocalNeighbourhoodMap pins={pins} city={city} hotKey={hotKey} focusKey={focusKey} onHot={setHotKey} onFocus={reveal} onCity={setCity} loading={!items && !error} className="h-full" />
          </div>
        )}

        {mode !== 'map' && error && <p className="mt-4 rounded-2xl bg-card p-6 text-sm">{error}</p>}
        {mode !== 'map' && !items && !error && <div className="mt-4 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>}
        {mode !== 'map' && items && !items.length && !error && (
          <div className="mt-4 rounded-2xl border border-border bg-card p-8 text-center">
            <p className="font-display text-lg font-bold">The noticeboard’s quiet for {city} {whenLabel}.</p>
            <p className="mt-1 text-sm text-muted-foreground">Clear a filter, peek at the full Board, or list the thing you already know about.</p>
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
                <span className="text-sm font-semibold">{dayLabel(day, today)}</span>
                <span className="font-mono text-xs text-muted-foreground">{rows.length} {rows.length === 1 ? 'event' : 'events'}</span>
                <ChevronDown className={cn('ml-auto h-4 w-4 text-primary transition-transform', !open && '-rotate-90')} />
              </button>
              {open && (
                <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {shown.map((ev) => <BoardCard key={rowKey(ev)} ev={ev} hot={hotKey === rowKey(ev) || focusKey === rowKey(ev)} onHot={setHotKey} saved={isSaved(ev.id)} onSave={() => save(ev)} />)}
                </div>
              )}
              {open && hidden > 0 && <button type="button" onClick={() => setMore((current) => ({ ...current, [day]: true }))} className="mt-2 text-sm font-semibold text-primary">Show {hidden} more {hidden === 1 ? 'event' : 'events'}</button>}
            </div>
          )
        })}

        {mode === 'list' && ordered.map(([day, rows]) => {
          const open = !closed[day]
          const shown = more[day] ? rows : rows.slice(0, PREVIEW)
          const hidden = rows.length - shown.length
          return (
            <div key={day} className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
              <button type="button" onClick={() => setClosed((current) => ({ ...current, [day]: open }))} className="flex w-full items-center gap-3 bg-primary/[0.08] px-3 py-2.5 text-left" aria-expanded={open}>
                <span className="text-sm font-semibold">{dayLabel(day, today)}</span>
                <span className="font-mono text-xs text-muted-foreground">{rows.length} {rows.length === 1 ? 'event' : 'events'}</span>
                <ChevronDown className={cn('ml-auto h-4 w-4 text-primary', !open && '-rotate-90')} />
              </button>
              {open && shown.map((ev) => {
                const key = rowKey(ev)
                return (
                  <div key={key} data-row={key} onMouseEnter={() => setHotKey(key)} onMouseLeave={() => setHotKey(null)} className={cn('flex items-center gap-3 border-t border-border/70 px-3 py-2', (hotKey === key || focusKey === key) && 'bg-primary/10')}>
                    <ListingPicture ev={ev} slot="square" className="h-12 w-12 shrink-0 rounded-lg" alt="" />
                    <Link href={ev.href || '/local'} className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{ev.title}</span>
                      <span className="text-sm text-muted-foreground">{[ev.suburb, clock(ev.time), sectionByKey(ev.section)?.short].filter(Boolean).join(' · ')}</span>
                    </Link>
                    {priceLine(ev)}
                    <SaveButton saved={isSaved(ev.id)} onClick={() => save(ev)} />
                  </div>
                )
              })}
              {open && hidden > 0 && <button type="button" onClick={() => setMore((current) => ({ ...current, [day]: true }))} className="w-full border-t border-border px-3 py-3 text-left text-sm font-semibold text-primary">Show {hidden} more {hidden === 1 ? 'event' : 'events'}</button>}
            </div>
          )
        })}
      </section>

      <section className="mt-12" aria-labelledby="local-weekend">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="local-weekend" className="font-display text-2xl font-bold">Make the most of your weekend.</h2>
            <p className="mt-1 text-muted-foreground">Saturday and Sunday in {city}, from the same list.</p>
          </div>
          <button type="button" onClick={() => { setWhen('weekend'); document.getElementById('local-board')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} className="h-11 text-sm font-semibold text-primary">See the whole weekend</button>
        </div>
        {!weekend && <div className="mt-4 h-24 animate-pulse rounded-2xl bg-muted" />}
        {weekend && !weekend.length && <p className="mt-4 rounded-2xl bg-card p-5 text-sm text-muted-foreground">This weekend is still a blank page in {city}. A market, a fete or a dog walk would look good here.</p>}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {weekendDays.map(([day, rows]) => (
            <div key={day} className="rounded-2xl border border-border bg-card p-4">
              <h3 className="font-semibold">{dayLabel(day, today)} <span className="font-mono text-xs text-muted-foreground">{rows.length}</span></h3>
              <ul className="mt-2 space-y-2">
                {rows.slice(0, 4).map((ev) => (
                  <li key={rowKey(ev)} className="flex items-center gap-2">
                    <ListingPicture ev={ev} slot="square" className="h-10 w-10 shrink-0 rounded-md" alt="" />
                    <Link href={ev.href || '/local'} className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-primary">{ev.title}</Link>
                    <span className="shrink-0 text-xs text-muted-foreground">{clock(ev.time)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
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

function CategoryButton({ tile, on, onPick }: { tile: LocalTile; on: boolean; onPick: () => void }) {
  return (
    <button type="button" aria-pressed={on} aria-label={tile.label} onClick={onPick} className={cn('w-[9.5rem] shrink-0 overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition lg:w-auto', on && 'ring-2 ring-primary ring-offset-2 ring-offset-background')}>
      <MascotFrame tile={tile} className="h-32 w-full" />
      <span className="block px-2 py-2 text-center text-sm font-semibold leading-tight">{tile.label}</span>
    </button>
  )
}

function BoardCard({ ev, hot, onHot, saved, onSave }: { ev: LocalItem; hot: boolean; onHot: (key: string | null) => void; saved: boolean; onSave: () => void }) {
  const key = rowKey(ev)
  const status = ev.status === 'CANCELLED' ? 'Cancelled' : ev.status === 'POSTPONED' ? 'Postponed' : ''
  return (
    <article data-row={key} onMouseEnter={() => onHot(key)} onMouseLeave={() => onHot(null)} className={cn('flex min-w-0 gap-3 rounded-2xl border border-border bg-card p-3', hot && 'bg-primary/10')} style={{ boxShadow: `inset 3px 0 0 ${ACCENT[ev.section] ?? '#ea580c'}` }}>
      <ListingPicture ev={ev} slot="square" className="h-20 w-20 shrink-0 rounded-xl" alt="" />
      <div className="min-w-0 flex-1">
        <Link href={ev.href || '/local'} className="block truncate font-semibold hover:text-primary">{ev.title}</Link>
        <p className="mt-0.5 text-sm text-muted-foreground">{[ev.suburb, clock(ev.time), status].filter(Boolean).join(' · ')}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><span className="truncate">{sectionByKey(ev.section)?.short ?? 'Local'}</span>{priceLine(ev)}</span>
          <SaveButton saved={saved} onClick={onSave} />
        </div>
      </div>
    </article>
  )
}

function SaveButton({ saved, onClick }: { saved: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={saved ? 'Remove from saved' : 'Save'} className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-full', saved ? 'text-primary' : 'text-muted-foreground')}>
      <Bookmark className={cn('h-4 w-4', saved && 'fill-current')} />
    </button>
  )
}
