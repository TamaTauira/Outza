'use client'

import { toast } from 'sonner'
import { CalendarCheckIcon, CalendarPlusIcon } from '@/components/calendar-plus-icon'
import { useItinerary, eventToItem } from '@/lib/itinerary'
import { cn } from '@/lib/utils'

type Ev = Parameters<typeof eventToItem>[0]

const ADD_LABEL = 'Add to itinerary'
const ADDED_LABEL = 'Added to itinerary'

/** Add to the itinerary. `compact` and `lineup` are icon-only; the default button includes the words. */
export function ItineraryButton({ event, compact = false, lineup = false, outline = false, surface, className }: { event: Ev; compact?: boolean; lineup?: boolean; outline?: boolean; surface?: string; className?: string }) {
  const { has, add, remove } = useItinerary()
  const inIt = has(event.id)
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (inIt) {
      remove(event.id)
      toast(lineup ? 'Dropped from the plan.' : 'Gone. Itinerary’s lighter.')
    } else {
      add(eventToItem(event), surface)
      toast.success(lineup ? 'On the itinerary.' : 'Locked in. It’s on your Itinerary.', { action: { label: 'View', onClick: () => { window.location.href = '/itinerary' } } })
    }
  }
  const iconLabel = inIt ? ADDED_LABEL : ADD_LABEL
  const Icon = inIt ? CalendarCheckIcon : CalendarPlusIcon

  if (lineup || compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          lineup
            ? 'relative z-20 p-1.5 rounded-md'
            : 'w-9 h-9 rounded-full flex items-center justify-center shadow-md transition-colors',
          inIt
            ? lineup ? 'text-primary' : 'bg-primary text-primary-foreground'
            : lineup ? 'text-muted-foreground hover:text-foreground' : 'bg-white/95 dark:bg-card/95 text-foreground hover:bg-primary hover:text-primary-foreground',
          className,
        )}
        aria-label={iconLabel}
        aria-pressed={inIt}
        title={iconLabel}
      >
        <Icon className={lineup ? 'w-4 h-4' : compact && !lineup ? 'w-5 h-5' : 'w-4 h-4'} aria-hidden />
      </button>
    )
  }

  const label = inIt ? 'On Your Itinerary' : 'Add to Itinerary'
  if (outline) {
    const short = inIt ? 'On itinerary' : 'Add to Itinerary'
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex h-11 w-full items-center justify-center gap-1 whitespace-nowrap rounded-xl border px-1.5 text-[11px] font-semibold sm:px-2 sm:text-xs',
          inIt ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-transparent text-foreground hover:bg-muted',
          className,
        )}
        aria-pressed={inIt}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {short}
      </button>
    )
  }
  return (
    <button type="button" onClick={onClick}
      className={cn('flex items-center justify-center gap-2 w-full py-3 rounded-lg font-semibold transition-colors', inIt ? 'bg-primary/15 text-primary' : 'bg-foreground text-background hover:opacity-90', className)}>
      <Icon className="w-5 h-5" aria-hidden />{label}
    </button>
  )
}
