'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bookmark, Check, ChevronRight, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useItinerary, eventToItem } from '@/lib/itinerary'
import { eventPath } from '@/lib/seo'
import { CATEGORIES } from '@/lib/categories'
import { categoryIcon, checkedAgo, formatPrice, formatTime, toMinutes } from '@/lib/board'
import type { SavedEvent } from '@/lib/saved'
import { cn } from '@/lib/utils'
import { tierDef } from '@/lib/tiers'
import { sourceLabel, statusInfo } from '@/lib/quality'
import { displaySuburb, tidyVenueName } from '@/lib/cities'

export type BoardEvent = SavedEvent

export type Status = { label: string; tone: 'live' | 'soon' | 'later' | 'done' | 'upcoming' | 'tbc' }

export function getStatus(ev: BoardEvent, day: string, today: string | null, nowMin: number): Status {
  const start = toMinutes(ev.time)
  if (start === null) return { label: 'All day', tone: 'tbc' }
  if (!today || day !== today) return { label: 'Upcoming', tone: 'upcoming' }
  const endSameDay = !ev.endDate || ev.endDate.slice(0, 10) === day
  let end = toMinutes(ev.endTime)
  if (end !== null && endSameDay && end <= start) end = null
  const effectiveEnd = !endSameDay ? 24 * 60 : end ?? start + 180
  if (nowMin >= effectiveEnd) return { label: 'Ended', tone: 'done' }
  if (nowMin >= start) return { label: 'On now', tone: 'live' }
  const diff = start - nowMin
  if (diff <= 60) return { label: `In ${diff} min`, tone: 'soon' }
  if (diff < 180) return { label: `In ${Math.floor(diff / 60)}h ${diff % 60}m`, tone: 'later' }
  return { label: 'Later today', tone: 'later' }
}

const STATUS_CLASS: Record<Status['tone'], string> = {
  live: 'text-free',
  soon: 'text-primary font-semibold',
  later: 'text-foreground/90',
  done: 'text-muted-foreground',
  upcoming: 'text-foreground/85',
  tbc: 'text-muted-foreground',
}

export const BOARD_COLS = 'xl:grid-cols-[92px_minmax(0,1fr)_minmax(0,250px)_130px_104px_104px_100px]'

interface BoardRowProps {
  ev: BoardEvent
  status: Status
  saved: boolean
  onToggleSave: (ev: BoardEvent) => void
  showDate?: string
}

export function BoardRow({ ev, status, saved, onToggleSave, showDate }: BoardRowProps) {
  const cat = CATEGORIES.find((c) => c.name === ev.category)
  const color = cat?.color ?? '#FF7A1A'
  const Icon = categoryIcon(ev.category)
  const t = formatTime(ev.time)
  const endMin = toMinutes(ev.endTime)
  const startMin = toMinutes(ev.time)
  const end = endMin !== null && startMin !== null && endMin !== startMin ? formatTime(ev.endTime) : null
  const price = formatPrice(ev.isFree, ev.price, ev.priceMin, ev.priceMax)
  const checked = checkedAgo(ev.updatedAt)
  const done = status.tone === 'done'
  const type = ev.subTags?.[0] ?? ev.category
  const suburb = displaySuburb(ev.suburb, ev.venueAddress, ev.city)
  const venue = tidyVenueName(ev.venueName, ev.venueAddress, ev.city)
  const reported = statusInfo(ev.status, ev.statusSource)
  const itinerary = useItinerary()
  const inIt = itinerary.has(ev.id)
  const toggleItinerary = () => {
    if (inIt) { itinerary.remove(ev.id); toast('Removed from your itinerary') }
    else { itinerary.add(eventToItem(ev)); toast.success('Added to your itinerary', { action: { label: 'View', onClick: () => { window.location.href = '/itinerary' } } }) }
  }
  const router = useRouter()
  const href = ev.href ?? eventPath(ev)
  // The whole row opens the event; buttons and links inside it keep their own job.
  const openRow = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('a,button,input,select,label')) return
    if (e.metaKey || e.ctrlKey) { window.open(href, '_blank', 'noopener'); return }
    router.push(href)
  }
  const itLabel = inIt ? 'Remove from my itinerary' : 'Add to my itinerary'
  const itButton = (extra: string) => (
    <button
      onClick={toggleItinerary}
      className={cn('relative z-20 p-1.5 rounded-md', inIt ? 'text-primary' : 'text-muted-foreground hover:text-foreground', extra)}
      aria-label={itLabel}
      aria-pressed={inIt}
      title={inIt ? 'In my itinerary' : 'Add to my itinerary'}
    >
      {inIt ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
    </button>
  )

  return (
    <div
      onClick={openRow}
      className={cn(
        'group relative cursor-pointer grid grid-cols-[72px_minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-center px-3 sm:px-5 py-3 xl:py-2 xl:min-h-[60px] border-b border-border last:border-b-0 hover:bg-muted/60 transition-colors focus-within:bg-muted/60',
        BOARD_COLS,
        done && 'opacity-75',
      )}
    >
      {/* Start */}
      <div className="row-span-2 xl:row-span-1 self-start xl:self-center pt-0.5 xl:pt-0">
        <span className="font-mono text-[15px] xl:text-base tabular-nums text-foreground">{t.hm}</span>
        <span className="ml-1 font-mono text-xs text-muted-foreground">{t.ampm}</span>
        {end && (
          <div className="font-mono text-xs leading-tight tabular-nums text-muted-foreground" title="Finish time">
            to {end.hm} {end.ampm}
          </div>
        )}
        {showDate && <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{showDate}</div>}
      </div>

      {/* Event */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="hidden sm:flex shrink-0 w-7 h-7 rounded-md items-center justify-center" style={{ backgroundColor: `${color}26`, color }}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <Link href={href} className="font-semibold text-base leading-snug line-clamp-2 break-words hover:text-primary transition-colors after:absolute after:inset-0 after:z-0 after:content-[''] after:rounded-sm focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-primary" title={ev.title}>
          {ev.title}
        </Link>
        {ev.promoTier && <span className="relative shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide text-black" style={{ backgroundColor: ev.promoTier === 'GOLD' ? '#F5B700' : ev.promoTier === 'BRONZE' ? '#CD7F32' : '#C0C7D1' }} title="Promoted event">{(tierDef(ev.promoTier)?.name ?? 'Featured').toUpperCase()}</span>}
        {!!ev.friendsGoing?.length && <span className="relative shrink-0 px-1.5 py-0.5 rounded bg-free/15 text-free text-[10px] font-semibold" title={`Going: ${ev.friendsGoing.join(', ')}`}>👥 {ev.friendsGoing.length}</span>}
        {reported && <span className={cn('relative shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold', reported.tone === 'bad' ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400')} title={reported.note}>{reported.label}</span>}
        {ev.verified && <span className="relative shrink-0 px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[10px] font-semibold" title="VibePeep Verified: recent refresh, required details, not a duplicate, no open date or venue report.">VibePeep Verified</span>}
        {!reported && !ev.verified && ev.confidenceLevel === 'low' && <span className="relative shrink-0 px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-medium" title="Low data confidence: not re-confirmed recently or details are missing. Check with the ticket seller.">Unconfirmed</span>}
        {ev.source && <span className="relative hidden xl:inline shrink-0 text-[10px] text-muted-foreground truncate max-w-[9rem]" title={ev.lastVerifiedAt ? `Last verified ${ev.lastVerifiedAt}` : undefined}>{sourceLabel(ev.source)}</span>}
        {ev.isLGBTI && <span className="relative shrink-0 rainbow-bg px-1.5 py-0.5 rounded text-[9px] font-bold text-white tracking-wide" title="LGBTIQ+ event">LGBTIQ+</span>}
      </div>

      {/* Save + itinerary (mobile top-right) */}
      <div className="xl:hidden justify-self-end flex items-center shrink-0">
        <button
          onClick={() => onToggleSave(ev)}
          className={cn('relative z-20 p-1.5 rounded-md hover:bg-muted', saved ? 'text-primary' : 'text-muted-foreground')}
          aria-label={saved ? 'Remove from saved' : 'Save event'}
        >
          <Bookmark className={cn('w-4 h-4', saved && 'fill-current')} />
        </button>
        {itButton('hover:bg-muted')}
      </div>

      {/* Venue / suburb */}
      <div className="col-start-2 col-span-2 xl:col-span-1 xl:col-start-auto min-w-0 leading-tight">
        <div className="text-sm text-foreground/90 truncate" title={ev.venueName}>
          {venue}
          <span className="xl:hidden text-muted-foreground">{suburb ? ` · ${suburb}` : ''}</span>
        </div>
        {suburb && <div className="hidden xl:block text-sm text-muted-foreground truncate mt-0.5">{suburb}</div>}
      </div>

      {/* Type */}
      <div className="hidden xl:block text-sm text-muted-foreground truncate" title={[ev.category, ...(ev.subTags ?? [])].join(', ')}>{type}</div>

      {/* Price */}
      <div className="col-start-2 xl:col-start-auto flex items-center gap-3 xl:block">
        <div className="leading-tight">
          {price.prefix && <div className="text-xs text-muted-foreground">{price.prefix}</div>}
          <span
            className={cn('font-mono text-sm whitespace-nowrap', price.kind === 'free' ? 'text-free' : price.kind === 'unknown' ? 'text-muted-foreground' : 'text-foreground')}
            title={checked ? `Price checked ${checked}` : undefined}
          >{price.value}</span>
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
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
        <button
          onClick={() => onToggleSave(ev)}
          className={cn('relative z-20 shrink-0 p-1.5 rounded-md hover:bg-background', saved ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}
          aria-label={saved ? 'Remove from saved' : 'Save event'}
          title={saved ? 'Saved' : 'Save'}
        >
          <Bookmark className={cn('w-4 h-4', saved && 'fill-current')} />
        </button>
        {itButton('hover:bg-background')}
      </div>
    </div>
  )
}

export function BoardHeadings() {
  return (
    <div className={cn('hidden xl:grid gap-x-3 px-5 py-2 bg-muted/70 border-b border-border font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground', BOARD_COLS)}>
      <span>Start</span>
      <span>Event</span>
      <span>Venue / Suburb</span>
      <span>Type</span>
      <span>Price</span>
      <span>Status</span>
      <span />
    </div>
  )
}

export function GroupBar({ label, count, open, onToggle }: { label: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="w-full flex items-center gap-3 px-3 sm:px-5 py-2.5 bg-primary/[0.07] border-y border-primary/20 text-left" aria-expanded={open}>
      <span className="font-semibold text-sm">{label}</span>
      <span className="font-mono text-xs text-muted-foreground">{count} {count === 1 ? 'event' : 'events'}</span>
      <span className="flex-1 h-px bg-primary/25" />
      <ChevronRight className={cn('w-4 h-4 text-primary transition-transform', open && 'rotate-90')} />
    </button>
  )
}
