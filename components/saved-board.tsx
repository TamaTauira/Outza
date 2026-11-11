'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Heart, MapPin } from 'lucide-react'
import { CalendarCheckIcon, CalendarPlusIcon } from '@/components/calendar-plus-icon'
import { toast } from 'sonner'
import { ViewToggle } from '@/components/view-toggle'
import { EventImage } from '@/components/event-image'
import { VibePeepMascot } from '@/components/vibepeep-mascot'
import { PageMasthead } from '@/components/page-masthead'
import { useSaved, type SavedEvent } from '@/lib/saved'
import { eventToItem, useItinerary } from '@/lib/itinerary'
import { addDays, formatPrice } from '@/lib/board'
import { boardClockLine } from '@/lib/listing-window'
import { displaySuburb, tidyVenueName } from '@/lib/cities'
import { coordsFitCity } from '@/lib/travel'
import { eventPath } from '@/lib/seo'
import { cn } from '@/lib/utils'
import type { FilterState } from '@/components/filter-panel'

const MapView = dynamic(() => import('@/components/map-view').then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Unfolding the map…</div>,
})

const QUIET_FILTERS: FilterState = { category: '', categories: [], subTag: '', suburb: '', isFree: false, isLGBTI: false, dateFrom: '', dateTo: '', datePreset: '' }
type Tab = 'all' | 'upcoming' | 'weekend' | 'past'
type ResultsView = 'list' | 'map'

const located = (ev: SavedEvent) => ev.latitude != null && ev.longitude != null && coordsFitCity(ev.latitude, ev.longitude, ev.city)

function weekendKeys(today: string) {
  const day = new Date(`${today}T00:00:00Z`).getUTCDay()
  const satOffset = day === 6 ? 0 : day === 0 ? -1 : 6 - day
  const sat = addDays(today, satOffset)
  return [sat, addDays(sat, 1)]
}

export function SavedBoard({ today, nowMinutes, onBrowse }: { today: string | null; nowMinutes: number; onBrowse: () => void }) {
  const { saved, isSaved, toggle, signedIn } = useSaved()
  void nowMinutes
  const itinerary = useItinerary()
  const [tab, setTab] = useState<Tab>('all')
  const [resultsView, setResultsView] = useState<ResultsView>('list')
  const [focusId, setFocusId] = useState<string | null>(null)

  useEffect(() => {
    try {
      const remembered = sessionStorage.getItem('vp-saved-view')
      if (remembered === 'list' || remembered === 'map') setResultsView(remembered)
    } catch {}
  }, [])
  const chooseView = (next: ResultsView) => {
    setResultsView(next)
    try { sessionStorage.setItem('vp-saved-view', next) } catch {}
  }

  const weekend = useMemo(() => (today ? weekendKeys(today) : []), [today])
  const weekendEvents = useMemo(() => saved.filter((ev) => weekend.includes(ev.date.slice(0, 10))), [saved, weekend])
  const visible = useMemo(() => (tab === 'weekend' ? weekendEvents : tab === 'past' ? [] : saved), [tab, weekendEvents, saved])
  const pins = useMemo(() => visible.filter(located), [visible])

  useEffect(() => {
    if (resultsView !== 'list' || !focusId) return
    document.getElementById(`saved-${focusId}`)?.scrollIntoView({ block: 'center' })
  }, [resultsView, focusId])

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'all', label: 'All saved', count: saved.length },
    { key: 'upcoming', label: 'Coming up', count: saved.length },
    { key: 'weekend', label: 'This weekend', count: weekendEvents.length },
    { key: 'past', label: 'Past events' },
  ]

  return (
    <div className="mb-10">
      <PageMasthead title="The keepers." lede="Your little collection of good times. All the things you’ve spotted, loved and don’t want to forget." />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Saved">
          {tabs.map((item) => (
                <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} onClick={() => setTab(item.key)} className={cn('inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold', tab === item.key ? 'bg-foreground text-background' : 'bg-muted text-foreground')}>
                  {item.label}{item.count != null ? ` (${item.count})` : ''}
                  {item.key === 'past' && <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Coming soon</span>}
                </button>
          ))}
        </div>
        <ViewToggle value={resultsView} onChange={chooseView} />
      </div>

      {!signedIn || saved.length === 0 ? (
        resultsView === 'map' ? (
          <p className="mt-6 rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">{signedIn ? 'Nothing with a pin yet. Save a night out and we’ll drop it on the map.' : 'Sign in and your keepers with a pin will land on the map.'}</p>
        ) : (
        <div className="mt-6 grid items-center gap-6 rounded-3xl border border-border bg-card px-5 py-8 sm:px-10 lg:grid-cols-[9rem_minmax(0,1fr)] lg:py-12">
          <VibePeepMascot className="mx-auto w-28 sm:w-32" alt="VibePeep" />
          <div className="text-center lg:text-left">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">Nothing saved. Yet.</h2>
          <p className="mt-2 max-w-xl text-muted-foreground">{signedIn ? 'Your future plans are out there. See something you love? Tap the heart and we’ll keep it here for you.' : 'Your keepers live on your account. Sign in and we’ll keep them safe.'}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
            {signedIn ? (
              <button type="button" onClick={onBrowse} className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">Find something good.</button>
            ) : (
              <>
                <Link href="/login?next=/saved" className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">Sign in</Link>
                <button type="button" onClick={onBrowse} className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm font-semibold">Find something good.</button>
              </>
            )}
          </div>
          </div>
        </div>
        )
      ) : (
        <>
          {tab === 'past' ? (
            <p className="mt-6 rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">The ones that have been. We’ll line them up here.</p>
          ) : resultsView === 'map' && pins.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">None of these have a pin we trust, so the map’s sitting this one out.</p>
          ) : resultsView === 'map' ? (
            <div className="mt-4">
              {pins.length < visible.length && <p className="mb-2 text-sm text-muted-foreground">{visible.length - pins.length} of these haven’t got a spot on the map yet.</p>}
              <div className="h-[70vh] min-h-[420px] overflow-hidden rounded-2xl border border-border">
                <MapView filters={QUIET_FILTERS} searchQuery="" city="" bleed eventsOverride={pins} focusId={focusId} onSelect={setFocusId} countNoun="saved events" />
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((ev) => (
                <SavedCard
                  key={ev.id}
                  ev={ev}
                  today={today}
                  weekend={weekend.includes(ev.date.slice(0, 10))}
                  saved={isSaved(ev.id)}
                  inPlan={itinerary.has(ev.id)}
                  active={focusId === ev.id}
                  onSave={() => toggle(ev)}
                  onPlan={() => {
                    if (itinerary.has(ev.id)) { itinerary.remove(ev.id); toast('Dropped from the plan.'); return }
                    itinerary.add(eventToItem(ev))
                    toast.success('On the itinerary.')
                  }}
                  onMap={located(ev) ? () => { setFocusId(ev.id); chooseView('map') } : undefined}
                />
              ))}
            </div>
          )}
        </>
      )}

          <section className="mt-10">
            <h2 className="font-display text-2xl font-bold">Your collections.</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {['Date night ideas', 'Gigs I want to see', 'Weekend adventures'].map((name) => (
                <div key={name} className="rounded-2xl border border-dashed border-border bg-card p-4">
                  <p className="font-semibold">{name}</p>
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-primary">Coming soon</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6 flex flex-col gap-4 rounded-3xl bg-[#0c0f0e] px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-bold">Don’t let this one slip past.</h2>
              <p className="mt-1 text-sm text-white/75">A nudge before it starts.</p>
            </div>
            <Link href={signedIn ? '/watchlist' : '/login?next=/watchlist'} className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">Set reminders</Link>
          </section>

          <section className="mt-6 flex flex-col items-start justify-between gap-3 rounded-3xl border border-border bg-card px-5 py-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-display text-xl font-bold">Looking for more to save?</h2>
              <p className="mt-1 text-sm text-muted-foreground">The good stuff is still out there.</p>
            </div>
            <button type="button" onClick={onBrowse} className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">See What’s On</button>
          </section>
    </div>
  )
}

function SavedCard({
  ev, today, weekend, saved, inPlan, active, onSave, onPlan, onMap,
}: {
  ev: SavedEvent
  today: string | null
  weekend: boolean
  saved: boolean
  inPlan: boolean
  active: boolean
  onSave: () => void
  onPlan: () => void
  onMap?: () => void
}) {
  const price = formatPrice(ev.isFree, ev.price, ev.priceMin, ev.priceMax)
  const when = boardClockLine(ev) ?? 'Time not listed'
  const date = new Date(ev.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const suburb = displaySuburb(ev.suburb, ev.venueAddress, ev.city)
  const venue = tidyVenueName(ev.venueName, ev.venueAddress, ev.city)
  const href = ev.href ?? eventPath(ev)
  return (
    <article id={`saved-${ev.id}`} className={cn('overflow-hidden rounded-2xl border bg-card', active ? 'border-primary ring-2 ring-primary/40' : 'border-border')}>
      <Link href={href} className="relative block aspect-[4/3]">
        <EventImage src={ev.imageUrl} kind="card" alt="" sizes="(min-width: 1280px) 30vw, 100vw" crop category={ev.category} slot="card" />
        <span className="absolute bottom-3 left-3 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">{weekend ? 'This weekend' : today && ev.date.slice(0, 10) < today ? 'Past' : 'Coming up'}</span>
      </Link>
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-lg font-bold leading-tight"><Link href={href} className="hover:text-primary">{ev.title}</Link></h3>
          <button type="button" onClick={onSave} aria-pressed={saved} aria-label={saved ? `Remove ${ev.title} from saved` : `Save ${ev.title}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted">
            <Heart className={saved ? 'h-4 w-4 fill-current text-[#FF4E6A]' : 'h-4 w-4'} />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">{date} · {when}</p>
        <p className="text-sm">{venue}{suburb ? ` · ${suburb}` : ''}</p>
        <p className="font-mono text-sm">{[price.prefix, price.value].filter(Boolean).join(' ')} · {ev.category}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={onPlan} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-semibold text-primary-foreground">
            {inPlan ? <CalendarCheckIcon className="h-4 w-4" aria-hidden /> : <CalendarPlusIcon className="h-4 w-4" aria-hidden />} {inPlan ? 'Remove from itinerary' : 'Add to itinerary'}
          </button>
          {onMap && <button type="button" onClick={onMap} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-semibold"><MapPin className="h-4 w-4" /> Map</button>}
          <button type="button" onClick={onSave} className="inline-flex h-10 items-center rounded-full border border-border px-3 text-sm font-semibold">Remove</button>
        </div>
      </div>
    </article>
  )
}
