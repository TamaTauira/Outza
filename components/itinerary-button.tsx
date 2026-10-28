'use client'

import { Plus, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useItinerary, eventToItem } from '@/lib/itinerary'
import { cn } from '@/lib/utils'

type Ev = Parameters<typeof eventToItem>[0]

/** "+ Add to my itinerary" toggle. `compact` renders a round + icon button for cards. */
export function ItineraryButton({ event, compact = false, className }: { event: Ev; compact?: boolean; className?: string }) {
  const { has, add, remove } = useItinerary()
  const inIt = has(event.id)
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (inIt) { remove(event.id); toast('Removed from your itinerary') }
    else { add(eventToItem(event)); toast.success('Added to your itinerary', { action: { label: 'View', onClick: () => { window.location.href = '/itinerary' } } }) }
  }
  const label = inIt ? 'In My Itinerary' : 'Add to My Itinerary'

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
