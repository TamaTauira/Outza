'use client'

import { Plus, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useItinerary, eventToItem } from '@/lib/itinerary'
import { cn } from '@/lib/utils'

type Ev = Parameters<typeof eventToItem>[0]

/** Add to My Itinerary toggle. `compact` is the icon on an event page. `lineup` matches the board-row plus. */
export function ItineraryButton({ event, compact = false, lineup = false, surface, className }: { event: Ev; compact?: boolean; lineup?: boolean; surface?: string; className?: string }) {
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
  const label = inIt ? 'On Your Itinerary' : 'Add to Itinerary'

  if (lineup) {
    const lineLabel = inIt ? 'Remove from my itinerary' : 'Add to my itinerary'
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn('relative z-20 p-1.5 rounded-md', inIt ? 'text-primary' : 'text-muted-foreground hover:text-foreground', className)}
        aria-label={lineLabel}
        aria-pressed={inIt}
        title={inIt ? 'In my itinerary' : 'Add to my itinerary'}
      >
        {inIt ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      </button>
    )
  }

  if (compact) {
    return (
      <button onClick={onClick} aria-label={label} title={label}
        className={cn('w-9 h-9 rounded-full flex items-center justify-center shadow-md transition-colors', inIt ? 'bg-primary text-primary-foreground' : 'bg-white/95 dark:bg-card/95 text-foreground hover:bg-primary hover:text-primary-foreground', className)}>
        {inIt ? <Check className="w-4 h-4" /> : <Plus className="w-5 h-5" />}
      </button>
    )
  }
  return (
    <button onClick={onClick}
      className={cn('flex items-center justify-center gap-2 w-full py-3 rounded-lg font-semibold transition-colors', inIt ? 'bg-primary/15 text-primary' : 'bg-foreground text-background hover:opacity-90', className)}>
      {inIt ? <Check className="w-4 h-4" /> : <Plus className="w-5 h-5" />}{label}
    </button>
  )
}
