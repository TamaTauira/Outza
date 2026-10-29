import Link from 'next/link'
import { Navigation } from 'lucide-react'
import { dayLabel, formatTime } from '@/lib/board'
import type { PlanViewLeg, PlanViewStop } from '@/lib/plan-picks'
import { eventPath } from '@/lib/seo'
import { cn } from '@/lib/utils'

function whenLine(date: string, time: string | null, today?: string | null) {
  const clock = time ? formatTime(time) : null
  return `${dayLabel(date, today)}${clock ? ` · ${clock.hm}${clock.ampm}` : ' · time not listed'}`
}

/** Stops for a day plan, with a travel line before every stop after the first event. */
export function OutingItinerary({
  stops,
  legs,
  tone,
  today,
}: {
  stops: PlanViewStop[]
  legs: PlanViewLeg[]
  tone: 'hero' | 'page'
  today?: string | null
}) {
  const byTo = new Map(legs.map((leg) => [leg.toId, leg]))
  const hero = tone === 'hero'
  return (
    <ol className="space-y-2.5">
      {stops.map((stop, i) => {
        const leg = stop.kind === 'event' ? byTo.get(stop.event.id) : undefined
        const key = stop.kind === 'event' ? stop.event.id : `${stop.tip}-${i}`
        return (
          <li key={key} className="space-y-2.5">
            {leg && (
              <div className={cn('flex flex-wrap items-center gap-x-2.5 gap-y-1 px-1 text-xs', hero ? 'text-white/75' : 'text-muted-foreground')} aria-label={`Travel between stops: ${leg.text}`}>
                <Navigation className="w-3.5 h-3.5 shrink-0 text-primary" aria-hidden />
                <span className={hero ? 'text-white/90' : 'font-medium text-foreground'}>{leg.text}</span>
                <a href={leg.href} target="_blank" rel="noopener noreferrer" className={cn('underline underline-offset-2', hero ? 'text-[#ffb4a6]' : 'text-primary')}>Directions</a>
              </div>
            )}
            {stop.kind === 'event' ? (
              <div className={hero ? 'rounded-lg bg-white/[0.03] p-3 ring-1 ring-white/10' : 'rounded-xl border border-border bg-card p-4'}>
                <p className={cn('text-xs font-semibold uppercase tracking-wide', hero ? 'text-[#ffb4a6]' : 'text-primary')}>Stop</p>
                <Link href={eventPath(stop.event)} className={cn('font-semibold hover:underline', hero ? 'mt-0.5 block leading-snug' : 'text-lg hover:text-primary')}>{stop.event.title}</Link>
                <p className={cn('mt-1 text-sm', hero ? 'text-white/70' : 'text-muted-foreground')}>
                  {whenLine(stop.event.date, stop.event.time, today)} · {stop.event.venueName}{stop.event.suburb ? `, ${stop.event.suburb}` : ''}
                </p>
                <p className={cn('mt-1 text-sm', hero ? 'text-white/80' : '')}>
                  {stop.event.category} · {stop.event.isFree ? 'Listed as free' : (stop.event.price || 'Price on the listing')}
                </p>
              </div>
            ) : (
              <div className={hero ? 'rounded-lg bg-white/[0.03] p-3 ring-1 ring-white/10' : 'rounded-xl border border-border bg-card p-4'}>
                <p className={cn('text-xs font-semibold uppercase tracking-wide', hero ? 'text-white/50' : 'text-muted-foreground')}>{stop.tip === 'dining' ? 'Dining note' : 'Transport note'}</p>
                <p className={cn('mt-1 text-sm', hero ? 'text-white/80' : '')}>{stop.text}</p>
                <a href={stop.href} target="_blank" rel="noopener noreferrer" className={cn('mt-2 inline-block text-sm underline underline-offset-2', hero ? 'text-[#ffb4a6]' : 'text-primary')}>
                  {stop.tip === 'dining' ? 'Search nearby food' : 'Open the trip planner'}
                </a>
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
