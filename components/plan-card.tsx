'use client'

import Link from 'next/link'
import { CalendarPlus, Check, MapPin, Navigation, Plus, RefreshCw, Share2, Shuffle, Trash2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Surface } from '@/components/ui/surface'
import { dayLabel } from '@/lib/board'
import { COPY } from '@/lib/copy'
import { displayClock } from '@/lib/format'
import { eventsToIcs } from '@/lib/ics'
import { eventToItem, useItinerary } from '@/lib/itinerary'
import { notifyAddedToItinerary, notifyRemovedFromItinerary } from '@/lib/notify'
import type { PlanView, PlanViewStop } from '@/lib/plan-picks'
import { eventPath } from '@/lib/seo'
import { cn } from '@/lib/utils'

function eventStops(plan: PlanView) {
  return plan.stops.flatMap((stop) => (stop.kind === 'event' ? [stop] : []))
}

function whenLine(date: string, time: string | null, today?: string | null) {
  const clock = time ? displayClock(time) : ''
  return `${dayLabel(date, today)}${clock ? ` · ${clock}` : ` · ${COPY.timeNotListed}`}`
}

export function PlanCard({
  plan,
  today,
  busy,
  canUndo,
  onSwap,
  onAdd,
  onShuffle,
  onRemove,
  onUndo,
}: {
  plan: PlanView
  today: string | null
  busy: boolean
  canUndo: boolean
  onSwap: (id: string) => void
  onAdd: () => void
  onShuffle: () => void
  onRemove: (id: string) => void
  onUndo: () => void
}) {
  const itinerary = useItinerary()
  const stops = eventStops(plan)

  const addStops = (ids: string[]) => {
    let added = 0
    for (const stop of stops) {
      if (!ids.includes(stop.event.id) || itinerary.has(stop.event.id)) continue
      itinerary.add(eventToItem(stop.event))
      added += 1
    }
    if (added) notifyAddedToItinerary(added)
    else toast('Those stops are already on your Itinerary')
  }

  const toggleStop = (id: string) => {
    if (itinerary.has(id)) {
      itinerary.remove(id)
      notifyRemovedFromItinerary()
      return
    }
    addStops([id])
  }

  const share = async () => {
    const url = `${window.location.origin}${plan.href}`
    const text = `${plan.title} in ${plan.city}`
    try {
      if (navigator.share) {
        await navigator.share({ title: plan.title, text, url })
        return
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Plan link copied')
    } catch {
      toast('Copy this link: ' + url)
    }
  }

  const calendar = () => {
    const body = eventsToIcs(stops.map((stop) => ({
      id: stop.event.id,
      title: stop.event.title,
      date: stop.event.date,
      time: stop.event.time,
      venueName: [stop.event.venueName, stop.event.suburb].filter(Boolean).join(', '),
      city: plan.city,
      url: new URL(eventPath(stop.event), window.location.origin).toString(),
    })), { calendarName: plan.title })
    const blob = new Blob([body], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'vibepeep-plan.ics'
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Calendar file downloaded')
  }

  return (
    <Surface pad="md" className="mt-hero" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="vp-eyebrow text-primary">Your plan</p>
          <h2 className="mt-1 font-display text-h3 leading-tight">{plan.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{plan.city}{plan.date ? ` · ${dayLabel(plan.date, today)}` : ''}</p>
        </div>
        <Button type="button" size="md" disabled={busy || !stops.length} onClick={() => addStops(stops.map((stop) => stop.event.id))}>
          <Check className="h-4 w-4" aria-hidden /> {COPY.acceptPlan}
        </Button>
      </div>
      <p className="mt-3 text-sm text-foreground">{plan.blurb}</p>
      <p className="mt-1 text-sm text-muted-foreground">Plans stay here in Ask until you add the stops to your Itinerary.</p>

      <ol className="mt-4 grid gap-3">
        {plan.stops.map((stop, index) => {
          const leg = stop.kind === 'event' ? plan.legs.find((item) => item.toId === stop.event.id) : undefined
          return (
            <li key={stopKey(stop, index)} className="grid gap-3">
              {leg ? (
                <p className="flex flex-wrap items-center gap-2 px-1 text-sm text-foreground">
                  <Navigation className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span>{leg.text}</span>
                  <a href={leg.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline underline-offset-2">Directions</a>
                </p>
              ) : null}
              <PlanStop
                stop={stop}
                today={today}
                saved={stop.kind === 'event' && itinerary.has(stop.event.id)}
                busy={busy}
                onKeep={() => stop.kind === 'event' && toggleStop(stop.event.id)}
                onSwap={() => stop.kind === 'event' && onSwap(stop.event.id)}
                onRemove={() => stop.kind === 'event' && onRemove(stop.event.id)}
              />
            </li>
          )
        })}
      </ol>
      {plan.legs.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">Travel times are a rough hop between stops. Not a timetable, and not the traffic.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="md" disabled={busy} onClick={onAdd}><Plus className="h-4 w-4" aria-hidden /> {COPY.addStop}</Button>
        <Button type="button" variant="outline" size="md" disabled={busy || stops.length < 2} onClick={onShuffle}><Shuffle className="h-4 w-4" aria-hidden /> {COPY.shufflePlan}</Button>
        <Button type="button" variant="outline" size="md" disabled={busy} onClick={() => { void share() }}><Share2 className="h-4 w-4" aria-hidden /> {COPY.sharePlan}</Button>
        <Button type="button" variant="outline" size="md" disabled={busy || !stops.length} onClick={calendar}><CalendarPlus className="h-4 w-4" aria-hidden /> {COPY.calendarPlan}</Button>
        <Button type="button" variant="ghost" size="md" disabled={!canUndo || busy} onClick={onUndo}><Undo2 className="h-4 w-4" aria-hidden /> {COPY.undo}</Button>
      </div>
    </Surface>
  )
}

function stopKey(stop: PlanViewStop, index: number) {
  return stop.kind === 'event' ? stop.event.id : `${stop.tip}-${index}`
}

function PlanStop({
  stop,
  today,
  saved,
  busy,
  onKeep,
  onSwap,
  onRemove,
}: {
  stop: PlanViewStop
  today: string | null
  saved: boolean
  busy: boolean
  onKeep: () => void
  onSwap: () => void
  onRemove: () => void
}) {
  if (stop.kind === 'tip') {
  return (
    <div className="rounded-control border border-border bg-muted/40 p-card-sm">
        <p className="vp-eyebrow text-muted-foreground">{stop.tip === 'dining' ? 'Dining note' : 'Getting there'}</p>
        <p className="mt-1 text-sm text-foreground">{stop.text}</p>
        <a href={stop.href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-control items-center text-sm font-semibold text-primary underline underline-offset-2">
          {stop.tip === 'dining' ? 'Search nearby food' : 'Open the trip planner'}
      </a>
    </div>
  )
}
  const event = stop.event
  return (
    <div className={cn('rounded-control border border-border p-card-sm', saved && 'border-brand-pink/50')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="vp-eyebrow text-primary">{saved ? COPY.onItinerary : 'Stop'}</p>
        {saved ? <Check className="h-4 w-4 text-brand-pink" aria-hidden /> : null}
      </div>
      <Link href={eventPath(event)} className="mt-1 block font-semibold leading-snug hover:underline">{event.title}</Link>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground">
        <span>{whenLine(event.date, event.time, today)}</span>
        <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />{event.venueName}{event.suburb ? `, ${event.suburb}` : ''}</span>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{event.category} · {event.isFree ? 'Free' : (event.price || COPY.priceFallback)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="md" variant={saved ? 'outline' : 'primary'} disabled={busy} onClick={onKeep}>
          {saved ? COPY.onItinerary : COPY.keepStop}
        </Button>
        <Button type="button" size="md" variant="outline" disabled={busy} onClick={onSwap}>
          <RefreshCw className="h-4 w-4" aria-hidden /> {COPY.swapStop}
        </Button>
        <Button type="button" size="md" variant="ghost" disabled={busy} onClick={onRemove}>
          <Trash2 className="h-4 w-4" aria-hidden /> {COPY.removeStop}
        </Button>
      </div>
    </div>
  )
}
