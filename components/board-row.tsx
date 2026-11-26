'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { SaveButton } from '@/components/save-button'
import { ItineraryButton } from '@/components/itinerary-button'
import { eventPath } from '@/lib/seo'
import { CATEGORIES } from '@/lib/categories'
import { categoryIcon, checkedAgo, formatPrice, latestIso } from '@/lib/board'
import { listPriceLabel } from '@/lib/price'
import { ListClock, listClockLabel, listPlaceLine } from '@/components/list-clock'
import { formatBoardRange, liveStatus, type BoardRange } from '@/lib/listing-window'
import type { SavedEvent } from '@/lib/saved'
import { cn } from '@/lib/utils'
import { tierDef } from '@/lib/tiers'
import { statusInfo } from '@/lib/quality'
import { displaySuburb, tidyVenueName } from '@/lib/cities'
import { displayPriceValue, displayTitle, parentCategory } from '@/lib/display-public'

export type BoardEvent = SavedEvent

export type Status = { label: string; tone: 'live' | 'soon' | 'later' | 'done' | 'upcoming' | 'tbc' }

export function getStatus(ev: BoardEvent, day: string, today: string | null, nowMin: number): Status {
  return liveStatus(ev, day, today, nowMin)
}

const STATUS_CLASS: Record<Status['tone'], string> = {
  live: 'text-free',
  soon: 'text-primary font-semibold',
  later: 'text-foreground/90',
  done: 'text-muted-foreground',
  upcoming: 'text-foreground/85',
  tbc: 'text-muted-foreground',
}

export const BOARD_COLS = 'xl:grid-cols-[5.25rem_minmax(0,1fr)_minmax(0,250px)_8.5rem_6.5rem_6.5rem_5.5rem]'

function timeLabel(when: BoardRange, end: string): string {
  if (!end) {
    if (when.hm === 'All day' || when.hm === '--:--') return when.label
    return `Starts ${when.hm}${when.ampm ? ` ${when.ampm}` : ''}`
  }
  const next = when.endNote === '+1' ? ' the next day' : when.endNote ? ` on ${when.endNote}` : ''
  return `Starts ${when.hm} ${when.ampm}, ends ${end}${next}`
}

/** Hour in a fixed right-aligned cell so 9:00 and 10:30 share one colon. */
function ClockFace({ hm, ampm }: { hm: string; ampm: string }) {
  const parts = /^(\d{1,2}):(\d{2})$/.exec(hm)
  if (!parts) return <b>{hm}</b>
  return (
    <>
      <b className="vp-time-hm">
        <span className="vp-time-hour">{parts[1]}</span>
        <span className="vp-time-colon">:</span>
        <span className="vp-time-min">{parts[2]}</span>
      </b>
      {ampm ? <i>{ampm}</i> : null}
    </>
  )
}

/** Gradient thread: filled start, hairline, hollow finish. Left aligned, no dash. */
function TimeStack({ when }: { when: BoardRange }) {
  const end = when.endLine?.replace(/^–\s*/, '') ?? ''
  const [endHm, endAmpm = ''] = end ? end.split(' ') : ['', '']
  const hasEnd = !!endHm
  return (
    <div className={cn('vp-time', !hasEnd && 'is-one')} aria-label={timeLabel(when, end)}>
      <span className="vp-time-rail" aria-hidden>
        <span className="vp-time-dot" />
        {hasEnd && <span className="vp-time-line" />}
        {hasEnd && <span className="vp-time-ring" />}
      </span>
      <span className="vp-time-start"><ClockFace hm={when.hm} ampm={when.ampm} /></span>
      {hasEnd ? (
        <span className="vp-time-end">
          <ClockFace hm={endHm} ampm={endAmpm} />
          {when.endNote === '+1' ? <sup className="vp-time-next" title="Finishes the next day">+1</sup> : null}
        </span>
      ) : null}
      {when.endNote && when.endNote !== '+1' ? <span className="vp-time-day">{when.endNote}</span> : null}
    </div>
  )
}

interface BoardRowProps {
  ev: BoardEvent
  status: Status
  saved: boolean
  onToggleSave: (ev: BoardEvent) => void
  showDate?: string
  trackSearch?: boolean
  active?: boolean
}

const iconBtn = 'relative z-20 grid h-11 w-11 shrink-0 place-items-center rounded-md p-0'

/** Portrait list row. Fixed height, one line each for the title, the venue and the chip. */
export function MobileEventRow({ ev, status, saved, onToggleSave, trackSearch, active, className, wrapTitle = false }: BoardRowProps & { className?: string; wrapTitle?: boolean }) {
  const shownTitle = displayTitle(ev.title)
  const catName = parentCategory(ev.category) || ev.category
  const cat = CATEGORIES.find((c) => c.name === catName)
  const color = cat?.color ?? '#FF7A35'
  const Icon = categoryIcon(catName)
  const when = formatBoardRange(ev)
  const price = listPriceLabel(ev.isFree, ev.price, ev.priceMin, ev.priceMax)
  const done = status.tone === 'done'
  const suburb = displaySuburb(ev.suburb, ev.venueAddress, ev.city)
  const venue = tidyVenueName(ev.venueName, ev.venueAddress, ev.city)
  const place = listPlaceLine([venue, suburb].filter(Boolean).join(' · '), when.endNote)
  const router = useRouter()
  const href = ev.href ?? eventPath(ev)
  const hasEnd = !!when.endLine
  const noteSearch = () => {
    if (trackSearch) navigator.sendBeacon?.('/api/analytics/search-click')
  }
  const openRow = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('a,button,input,select,label')) return
    if (e.metaKey || e.ctrlKey) { window.open(href, '_blank', 'noopener'); return }
    router.push(href, { scroll: false })
  }
  return (
    <div
      onClick={openRow}
      data-vp-row="list"
      data-event-id={ev.id}
      data-has-end={hasEnd ? 'true' : 'false'}
      className={cn('vp-mrow', wrapTitle && 'is-title-2', !hasEnd && 'is-one', done && 'is-done', active && 'is-active', className)}
    >
      <span className="sr-only">{listClockLabel(when)}</span>
      <span className="vp-mrow-rail" aria-hidden>
        <span className="vp-mrow-dot" />
        {hasEnd ? <span className="vp-mrow-line" /> : null}
        {hasEnd ? <span className="vp-mrow-ring" /> : null}
      </span>
      <span className="vp-mrow-start" title={when.label}>
        <ListClock when={when} part="start" />
      </span>
      {hasEnd ? (
        <span className="vp-mrow-end" title={when.label}>
          <ListClock when={when} part="end" />
        </span>
      ) : null}
      <span className="vp-mrow-line1">
        <Link href={href} scroll={false} onClick={noteSearch} className="vp-mrow-title after:absolute after:inset-0 after:z-0 after:content-[''] focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-primary">
          {shownTitle}
        </Link>
        {place ? <span className="vp-mrow-venue-inline">{place}</span> : null}
      </span>
      <span className="vp-mrow-venue">{place}</span>
      <span className="vp-mrow-meta">
        <span className="vp-chip vp-mrow-chip" style={{ backgroundColor: `color-mix(in srgb, ${color} 28%, #151a19)`, color: '#F5F5F2' }}>
          <Icon className="h-3 w-3 shrink-0" aria-hidden />
          <span>{catName}</span>
        </span>
        <span className={cn('vp-price', price.kind === 'free' && 'is-free')}>{price.text}</span>
      </span>
      <span className="vp-mrow-actions">
        <SaveButton saved={saved} onClick={() => onToggleSave(ev)} label={saved ? 'Remove from saved' : 'Save event'} className={cn(iconBtn, 'bg-transparent', saved ? 'text-primary' : 'text-muted-foreground')} />
        <ItineraryButton lineup event={ev} className={iconBtn} />
      </span>
    </div>
  )
}

export function BoardRow({ ev, status, saved, onToggleSave, trackSearch, active, wrapTitle = false }: BoardRowProps & { wrapTitle?: boolean }) {
  const shownTitle = displayTitle(ev.title)
  const catName = parentCategory(ev.category) || ev.category
  const cat = CATEGORIES.find((c) => c.name === catName)
  const color = cat?.color ?? '#FF7A35'
  const Icon = categoryIcon(ev.category)
  const when = formatBoardRange(ev)
  const price = formatPrice(ev.isFree, ev.price, ev.priceMin, ev.priceMax)
  const checked = checkedAgo(latestIso(ev.lastVerifiedAt, ev.updatedAt))
  const done = status.tone === 'done'
  const type = ev.subTags?.[0] ?? catName
  const suburb = displaySuburb(ev.suburb, ev.venueAddress, ev.city)
  const venue = tidyVenueName(ev.venueName, ev.venueAddress, ev.city)
  const reported = statusInfo(ev.status, ev.statusSource)
  const router = useRouter()
  const href = ev.href ?? eventPath(ev)
  const noteSearch = () => {
    if (trackSearch) navigator.sendBeacon?.('/api/analytics/search-click')
  }
  // The whole row opens the event; buttons and links inside it keep their own job.
  const openRow = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('a,button,input,select,label')) return
    if (e.metaKey || e.ctrlKey) { window.open(href, '_blank', 'noopener'); return }
    router.push(href, { scroll: false })
  }
  return (
    <>
    <MobileEventRow ev={ev} status={status} saved={saved} onToggleSave={onToggleSave} trackSearch={trackSearch} active={active} wrapTitle={wrapTitle} className="xl:hidden" />
    <div
      onClick={openRow}
      className={cn(
        'hidden xl:grid group relative cursor-pointer items-center gap-x-3 border-b border-border px-5 py-2 last:border-b-0 hover:bg-muted/60 transition-colors focus-within:bg-muted/60',
        BOARD_COLS,
        done && 'opacity-75',
        active && 'bg-primary/10',
      )}
      data-event-id={ev.id}
    >
      {/* Start */}
      <div className="row-span-2 xl:row-span-1 self-start xl:self-center min-w-0 pt-0.5 xl:pt-0" title={when.label}>
        <TimeStack when={when} />
      </div>

      {/* Event */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="hidden sm:flex shrink-0 w-7 h-7 rounded-md items-center justify-center" style={{ backgroundColor: `${color}26`, color }}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <Link href={href} scroll={false} onClick={noteSearch} className="min-w-0 flex-1 truncate font-semibold text-base leading-tight hover:text-primary transition-colors after:absolute after:inset-0 after:z-0 after:content-[''] after:rounded-sm focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-primary" title={ev.title}>
          {shownTitle}
        </Link>
        {(ev.promoTier || ev.sponsored) && <span className="relative shrink-0 px-1.5 py-0.5 rounded text-caption font-bold tracking-wide text-black" style={{ backgroundColor: ev.promoTier === 'GOLD' ? '#F5B700' : ev.promoTier === 'BRONZE' ? '#CD7F32' : '#C0C7D1' }} title={ev.promoTier ? `${tierDef(ev.promoTier)?.name ?? 'Promoted'} placement` : 'Sponsored placement'}>SPONSORED</span>}
        {!!ev.friendsGoing?.length && <span className="relative shrink-0 px-1.5 py-0.5 rounded bg-free/15 text-free text-xs font-semibold" title={`Going: ${ev.friendsGoing.join(', ')}`}>👥 {ev.friendsGoing.length}</span>}
        {reported && <span className={cn('relative shrink-0 px-1.5 py-0.5 rounded text-xs font-semibold', reported.tone === 'bad' ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400')} title={reported.note}>{reported.label}</span>}
        {ev.isLGBTI && <span className="relative shrink-0 rainbow-bg px-1.5 py-0.5 rounded text-caption font-bold text-white tracking-wide" title="LGBTIQ+ event">LGBTIQ+</span>}
      </div>

      {/* Save + itinerary (mobile top-right) */}
      <div className="xl:hidden justify-self-end flex items-center shrink-0">
        <SaveButton saved={saved} onClick={() => onToggleSave(ev)} label={saved ? 'Remove from saved' : 'Save event'} className={cn('relative z-20 bg-transparent hover:bg-muted', saved ? 'text-primary' : 'text-muted-foreground')} />
        <ItineraryButton lineup event={ev} className="hover:bg-muted" />
      </div>

      {/* Venue / suburb */}
      <div className="col-start-2 col-span-2 xl:col-span-1 xl:col-start-auto min-w-0 leading-tight">
        <div className="text-sm text-foreground/90 truncate" title={ev.venueName}>
          {venue}
          <span className="xl:hidden text-muted-foreground">{suburb ? ` · ${suburb}` : ''}</span>
        </div>
        {suburb && <div className="hidden xl:block truncate text-sm leading-tight text-muted-foreground">{suburb}</div>}
      </div>

      {/* Type */}
      <div className="hidden xl:block truncate text-sm text-muted-foreground" title={[ev.category, ...(ev.subTags ?? [])].join(', ')}>{type}</div>

      {/* Price */}
      <div className="col-start-2 xl:col-start-auto flex items-center gap-3 xl:block">
        <div className="leading-tight">
          {price.prefix && <div className="text-xs text-muted-foreground">{price.prefix}</div>}
          <span
            className={cn('font-mono text-sm whitespace-nowrap', price.kind === 'free' ? 'text-free' : price.kind === 'unknown' ? 'text-muted-foreground' : 'text-foreground')}
            title={checked ? `Price checked ${checked}` : undefined}
          >{displayPriceValue(price.value, price.kind)}</span>
        </div>
        <span className={cn('xl:hidden text-sm', STATUS_CLASS[status.tone])}>
          {status.tone === 'live' && <span className="inline-block w-1.5 h-1.5 mr-1 rounded-full bg-free animate-pulse align-middle" />}
          {status.label}
        </span>
      </div>

      {/* Status */}
      <div className={cn('hidden xl:flex items-center gap-1.5 text-sm', STATUS_CLASS[status.tone])}>
        {status.tone === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-free animate-pulse" />}
        {status.label}
      </div>

      {/* Actions */}
      <div className="hidden xl:flex items-center justify-end gap-1">
        <SaveButton saved={saved} onClick={() => onToggleSave(ev)} label={saved ? 'Remove from saved' : 'Save event'} className={cn('relative z-20 rounded-md bg-transparent hover:bg-background', saved ? 'text-primary' : 'text-muted-foreground hover:text-foreground')} />
        <ItineraryButton lineup event={ev} className="hover:bg-background" />
      </div>
    </div>
    </>
  )
}

export function BoardHeadings() {
  return (
    <div className={cn('sticky top-[var(--vp-header-offset)] z-10 hidden border-b border-border bg-muted/90 px-5 py-2 font-mono text-xs text-muted-foreground backdrop-blur xl:grid xl:gap-x-3', BOARD_COLS)}>
      <span>Time</span>
      <span>Event</span>
      <span>Venue / Suburb</span>
      <span>Type</span>
      <span>Price</span>
      <span>Status</span>
      <span />
    </div>
  )
}

export function GroupBar({ label, count, open, onToggle, pin = 'board' }: { label: string; count: number; open: boolean; onToggle: () => void; pin?: 'board' | 'page' }) {
  return (
    <button onClick={onToggle} className={cn('vp-day-head sticky z-20 flex h-11 w-full items-center gap-3 border-y border-border bg-background px-3 text-left sm:px-5', pin === 'page' && 'vp-day-head-page')} aria-expanded={open}>
      <span className="font-semibold text-sm">{label}</span>
      <span className="font-mono text-xs text-muted-foreground">{count} {count === 1 ? 'event' : 'events'}</span>
      <span className="flex-1 h-px bg-primary/25" />
      <ChevronRight className={cn('w-4 h-4 text-primary transition-transform', open && 'rotate-90')} />
    </button>
  )
}
