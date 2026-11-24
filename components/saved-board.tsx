'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { LayoutList, Map as MapIcon, MapPin } from 'lucide-react'
import { CalendarCheckIcon, CalendarPlusIcon } from '@/components/calendar-plus-icon'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { CtaBanner } from '@/components/cta-banner'
import { AddToCollection, CollectionsPanel, collectionEventFrom } from '@/components/collections-panel'
import { SaveButton } from '@/components/save-button'
import { EventImage } from '@/components/event-image'
import { VibePeepMascot } from '@/components/vibepeep-mascot'
import { PageMasthead } from '@/components/page-masthead'
import { useSaved, type SavedEvent } from '@/lib/saved'
import { eventToItem, useItinerary } from '@/lib/itinerary'
import { addDays, formatPrice } from '@/lib/board'
import { COPY } from '@/lib/copy'
import { formatDate, formatTime } from '@/lib/format'
import { notifyAddedToItinerary, notifyRemovedFromItinerary } from '@/lib/notify'
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

  if (!signedIn) {
    return (
      <div className="mb-10">
        <PageMasthead variant="saved" />
        <div className="mt-[var(--vp-card-gap)] grid items-center gap-6 rounded-3xl bg-card px-5 py-8 shadow-[var(--vp-shadow-md)] sm:px-10 lg:grid-cols-[9rem_minmax(0,1fr)] lg:py-12">
          <VibePeepMascot className="mx-auto w-28 sm:w-32" alt="VibePeep" />
          <div className="text-center lg:text-left">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">Sign in to save events</h2>
            <p className="mt-2 max-w-xl text-muted-foreground">Saved events live on your account. Browse what’s on, then save the ones you want.</p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              <Button asChild size="md"><Link href="/login?next=/saved">{COPY.signIn}</Link></Button>
              <Button type="button" variant="outline" size="md" onClick={onBrowse}>{COPY.browse}</Button>
            </div>
          </div>
        </div>
        <CollectionsPanel />
        <CtaBanner
          tone="card"
          title="Looking for more to save?"
          lede="The good stuff is still out there."
          action={<Button type="button" size="md" onClick={onBrowse}>{COPY.browse}</Button>}
        />
      </div>
    )
  }

  return (
    <div className="mb-10">
      <PageMasthead variant="saved">
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Saved">
            {tabs.map((item) => (
              <Chip key={item.key} onDark pressed={tab === item.key} onClick={() => setTab(item.key)}>
                {item.label}{saved.length > 0 && item.count != null ? ` (${item.count})` : ''}
              </Chip>
            ))}
          </div>
          <SegmentedControl value={resultsView} onChange={chooseView} label="List or map" className="bg-white/90" options={[{ key: 'list', text: 'List', Icon: LayoutList }, { key: 'map', text: 'Map', Icon: MapIcon }]} />
        </div>
      </PageMasthead>

      {!signedIn || saved.length === 0 || visible.length === 0 ? (
        resultsView === 'map' ? (
          <p className="mt-[var(--vp-card-gap)] rounded-3xl bg-card px-4 py-6 text-sm text-muted-foreground shadow-[var(--vp-shadow-md)]">{signedIn ? 'Nothing with a pin yet. Save a night out and we’ll drop it on the map.' : 'Sign in and your keepers with a pin will land on the map.'}</p>
        ) : (
        <div className="mt-[var(--vp-card-gap)] grid items-center gap-6 rounded-3xl bg-card px-5 py-8 shadow-[var(--vp-shadow-md)] sm:px-10 lg:grid-cols-[9rem_minmax(0,1fr)] lg:py-12">
          <VibePeepMascot className="mx-auto w-28 sm:w-32" alt="VibePeep" />
          <div className="text-center lg:text-left">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">{saved.length && visible.length === 0 ? 'Nothing in this set.' : 'Nothing saved. Yet.'}</h2>
          <p className="mt-2 max-w-xl text-muted-foreground">{saved.length && visible.length === 0 ? 'None of your saved events fall in this window. Try All saved, or come back when the weekend lands.' : signedIn ? 'See something you love? Tap the bookmark and we’ll keep it here for you.' : 'Your saved events live on your account. Sign in and we’ll keep them safe.'}</p>
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
            <p className="mt-[var(--vp-card-gap)] rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">The ones that have been. We’ll line them up here.</p>
          ) : resultsView === 'map' && pins.length === 0 ? (
            <p className="mt-[var(--vp-card-gap)] rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">None of these have a pin we trust, so the map’s sitting this one out.</p>
          ) : resultsView === 'map' ? (
            <div className="mt-4">
              {pins.length < visible.length && <p className="mb-2 text-sm text-muted-foreground">{visible.length - pins.length} of these haven’t got a spot on the map yet.</p>}
              <div className="h-[70vh] min-h-[420px] overflow-hidden rounded-2xl border border-border">
                <MapView filters={QUIET_FILTERS} searchQuery="" city="" bleed eventsOverride={pins} focusId={focusId} onSelect={setFocusId} countNoun="saved events" />
              </div>
            </div>
          ) : (
            <div className="vp-card-grid mt-[var(--vp-card-gap)] grid-cols-[repeat(auto-fill,minmax(min(100%,var(--vp-card-min)),1fr))]">
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
                    if (itinerary.has(ev.id)) { itinerary.remove(ev.id); notifyRemovedFromItinerary(); return }
                    itinerary.add(eventToItem(ev))
                    notifyAddedToItinerary()
                  }}
                  onMap={located(ev) ? () => { setFocusId(ev.id); chooseView('map') } : undefined}
                />
              ))}
            </div>
          )}
        </>
      )}

          <CollectionsPanel />

          <CtaBanner
            tone="dark"
            title="Don’t let this one slip past."
            lede="A nudge before it starts."
            action={<Button asChild size="md"><Link href={signedIn ? '/account#inbox' : '/login?next=/account'}>Set reminders</Link></Button>}
          />

          <CtaBanner
            tone="card"
            title="Looking for more to save?"
            lede="The good stuff is still out there."
            action={<Button type="button" size="md" onClick={onBrowse}>{COPY.browse}</Button>}
          />
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
  const when = formatTime(ev.time) || boardClockLine(ev) || COPY.timeNotListed
  const date = formatDate(ev.date, 'card')
  const suburb = displaySuburb(ev.suburb, ev.venueAddress, ev.city)
  const venue = tidyVenueName(ev.venueName, ev.venueAddress, ev.city)
  const href = ev.href ?? eventPath(ev)
  return (
    <article id={`saved-${ev.id}`} className={cn('flex h-full flex-col overflow-hidden rounded-card border bg-card', active ? 'border-primary ring-2 ring-primary/40' : 'border-border')}>
      <Link href={href} scroll={false} className="relative block aspect-[4/3]">
        <EventImage src={ev.imageUrl} kind="card" alt="" sizes="(min-width: 1280px) 30vw, 100vw" crop category={ev.category} slot="card" />
        <span className="absolute bottom-3 left-3 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">{weekend ? 'This weekend' : today && ev.date.slice(0, 10) < today ? 'Past' : 'Coming up'}</span>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-card">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-h3 leading-tight"><Link href={href} scroll={false} className="hover:text-primary">{ev.title}</Link></h3>
          <SaveButton saved={saved} onClick={onSave} label={saved ? `Remove ${ev.title} from saved` : `Save ${ev.title}`} />
        </div>
        <p className="text-sm text-muted-foreground">{date} · {when}</p>
        <p className="text-sm">{venue}{suburb ? ` · ${suburb}` : ''}</p>
        <p className="font-mono text-sm">{[price.prefix, price.value].filter(Boolean).join(' ')} · {ev.category}</p>
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          <Button type="button" size="md" onClick={onPlan}>
            {inPlan ? <CalendarCheckIcon className="h-4 w-4" aria-hidden /> : <CalendarPlusIcon className="h-4 w-4" aria-hidden />} {inPlan ? COPY.onItinerary : COPY.addToItinerary}
          </Button>
          {onMap && <Button type="button" size="md" variant="outline" onClick={onMap}><MapPin className="h-4 w-4" /> Map</Button>}
          <AddToCollection event={collectionEventFrom(ev)} />
          <Button type="button" size="md" variant="outline" onClick={onSave}>Remove</Button>
        </div>
      </div>
    </article>
  )
}
