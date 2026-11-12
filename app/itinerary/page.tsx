'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Trash2, AlertTriangle, Plus, MapPin, Clock, Footprints, Car, Navigation, Loader2, Pencil, ExternalLink, ChevronUp, ChevronDown, Share2, CalendarPlus, Search } from 'lucide-react'
import { CalendarPlusIcon } from '@/components/calendar-plus-icon'
import { toast } from 'sonner'
import { eventPath } from '@/lib/seo'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { useSession } from 'next-auth/react'
import { useSaved } from '@/lib/saved'
import { PageMasthead } from '@/components/page-masthead'
import { ViewToggle } from '@/components/view-toggle'
import { useItinerary, useItineraryLabel, sortItinerary, clashMap, eventToItem, type ItineraryItem } from '@/lib/itinerary'
import { boardClockLine } from '@/lib/listing-window'
import { coordsFitCity, directionsUrl, distanceKm, fmtKm, fmtMin, planLeg } from '@/lib/travel'
import { eventsToIcs } from '@/lib/ics'
import { StopForm, emptyStop, type StopFormValues } from './stop-form'
import { RoutePicks, pickStopId, slotBetween, type RoutePick } from './route-picks'

const ItineraryMap = dynamic(() => import('@/components/itinerary-map').then((m) => m.ItineraryMap), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Unfolding the map…</div>,
})

const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const toMin = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null)
const believable = (i: ItineraryItem) => i.lat != null && i.lng != null && coordsFitCity(i.lat, i.lng, i.city)
const needsGeo = (i: ItineraryItem) => !believable(i) && !i.geoFailed && (i.kind === 'event' || !!(i.place || i.venueName))
const clock = (t: string | null) => {
  if (!t) return null
  const h = Number(t.slice(0, 2))
  const m = t.slice(3, 5)
  if (!Number.isFinite(h)) return null
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'am' : 'pm'}`
}
const durationLabel = (start: string | null, end: string | null) => {
  const a = toMin(start)
  const b = toMin(end)
  if (a == null || b == null || a === b) return null
  return fmtMin(b > a ? b - a : b + 1440 - a)
}

function arrange(list: ItineraryItem[]) {
  const byTime = sortItinerary(list)
  const days = [...new Set(byTime.map((item) => item.date))]
  return days.flatMap((day) => {
    const dayItems = byTime.filter((item) => item.date === day)
    if (dayItems.length > 0 && dayItems.every((item) => typeof item.order === 'number')) {
      return [...dayItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    }
    return dayItems
  })
}

function derivedTitle(list: ItineraryItem[]) {
  if (!list.length) return 'Your plan'
  const day = list[0].date
  const sameDay = list.every((item) => item.date === day)
  const cities = [...new Set(list.map((item) => item.city).filter(Boolean))]
  const times = list.map((item) => item.time).filter((time): time is string => !!time)
  const evening = times.length > 0 && times.every((time) => time >= '17:00')
  const when = sameDay ? `${new Date(`${day}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })}${evening ? ' night' : ''}` : 'Your plan'
  return cities.length === 1 ? `${when} in ${cities[0]}` : when
}

function downloadIcs(list: ItineraryItem[], name: string) {
  const body = eventsToIcs(list.map((item) => ({
    id: item.id,
    title: item.title,
    date: item.date,
    endDate: item.date,
    time: item.time,
    endTime: item.endTime,
    venueName: [item.venueName, item.place].filter(Boolean).join(', ') || null,
    city: item.city,
    url: item.kind === 'event' ? (item.href ?? eventPath(item)) : null,
  })), { calendarName: name || 'VibePeep itinerary' })
  const blob = new Blob([body], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'vibepeep-itinerary.ics'
  a.click()
  URL.revokeObjectURL(url)
}

/** Travel estimate between two consecutive stops on the same day. */
function TravelLeg({ from, to, locating }: { from: ItineraryItem; to: ItineraryItem; locating: boolean }) {
  const box = 'ml-8 flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-xs text-muted-foreground'
  const planned = planLeg(from, to)
  if (planned.kind === 'same') return <div className={box}><MapPin className="h-3.5 w-3.5" />Same location</div>
  if (planned.kind === 'different-city') {
    return <div className={box}><Navigation className="h-3.5 w-3.5" />These stops are in {planned.fromCity} and {planned.toCity}. Different cities, so we’re not calling that one trip.</div>
  }
  if (planned.kind === 'unreliable') {
    return <div className={box}><Navigation className="h-3.5 w-3.5" />Same city, but the pins look too far apart. Hit Directions for the real route.</div>
  }
  if (planned.kind === 'missing') {
    if (locating) return <div className={box}><Loader2 className="h-3.5 w-3.5 animate-spin" />Working out travel time…</div>
    const missing = from.lat == null || from.lng == null ? from : to
    return <div className={box}><Navigation className="h-3.5 w-3.5" />{missing.kind === 'custom' && !missing.place && !missing.venueName ? `Add a location to “${missing.title}” to see travel time` : `Couldn’t map “${missing.title}”, so no travel time`}</div>
  }
  const leg = planned.leg
  const a = { lat: from.lat!, lng: from.lng! }, b = { lat: to.lat!, lng: to.lng! }
  const leave = toMin(from.endTime), arrive = toMin(to.time)
  const gap = leave !== null && arrive !== null ? arrive - leave : null
  const tight = gap !== null && gap >= 0 && gap < leg.recommendedMin
  return (
    <div className={box}>
      <span className="font-medium text-foreground">{fmtKm(leg.km)}</span>
      <span className="inline-flex items-center gap-1"><Footprints className="h-3.5 w-3.5" />≈ {fmtMin(leg.walkMin)} walk</span>
      <span className="inline-flex items-center gap-1"><Car className="h-3.5 w-3.5" />≈ {fmtMin(leg.driveMin)} drive</span>
      <a href={directionsUrl(a, b, leg.mode === 'walking' ? 'walking' : 'transit')} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><Navigation className="h-3.5 w-3.5" />Directions</a>
      {tight && <span className="inline-flex basis-full items-center gap-1 text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5" />Tight: {gap} min between stops, travel takes about {fmtMin(leg.recommendedMin)}</span>}
    </div>
  )
}

type Hit = { id: string; title: string; date: string; time?: string | null; endTime?: string | null; venueName?: string | null; venueAddress?: string | null; suburb?: string | null; city?: string | null; latitude?: number | null; longitude?: number | null; imageUrl?: string | null }

export default function ItineraryPage() {
  const { saved } = useSaved()
  const { status } = useSession() || {}
  const { items, add, remove, update, clear, has } = useItinerary()
  const { label, save: saveLabel } = useItineraryLabel()
  const [editing, setEditing] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [picks, setPicks] = useState<Record<string, RoutePick[]>>({})
  const [locating, setLocating] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list')
  const [focusPane, setFocusPane] = useState<'list' | 'map'>('list')
  const [wide, setWide] = useState(false)
  const [mapFull, setMapFull] = useState(false)
  const [panel, setPanel] = useState<'event' | 'custom' | 'nearby' | null>(null)
  const [eventQuery, setEventQuery] = useState('')
  const [eventHits, setEventHits] = useState<Hit[]>([])
  const [eventBusy, setEventBusy] = useState(false)
  const [nearbyHits, setNearbyHits] = useState<Array<Hit & { km: number }>>([])
  const [nearbyNote, setNearbyNote] = useState('')
  const [nearbyBusy, setNearbyBusy] = useState(false)
  const inFlight = useRef(false)
  const agendaRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const apply = () => setWide(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    const todo = items.filter(needsGeo).slice(0, 20)
    if (!todo.length || inFlight.current) return
    inFlight.current = true
    setLocating(true)
    fetch('/api/itinerary/locate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stops: todo.map((i) => ({ id: i.id, query: i.place ?? [i.venueName, i.suburb].filter(Boolean).join(', '), city: i.city })) }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        for (const i of todo) {
          const g = data?.locations?.[i.id]
          const fit = g && coordsFitCity(g.lat, g.lng, i.city)
          update(i.id, fit ? { lat: g.lat, lng: g.lng, geoFailed: false } : { lat: null, lng: null, geoFailed: true })
        }
      })
      .catch((err) => console.error('Could not locate itinerary stops:', err))
      .finally(() => { inFlight.current = false; setLocating(false) })
  }, [items, update])

  const arranged = useMemo(() => arrange(items), [items])
  const clash = clashMap(sortItinerary(items))
  const dismissClash = (i: ItineraryItem) => update(i.id, { okWith: [...new Set([...(i.okWith ?? []), ...(clash.get(i.id) ?? [])])] })
  const days = [...new Set(arranged.map((i) => i.date))]
  const title = label || derivedTitle(arranged)
  const start = sortItinerary(items).find((item) => item.time)?.time ?? null
  const finish = items.map((item) => item.endTime).filter((time): time is string => !!time).sort().at(-1) ?? null
  const cities = [...new Set(arranged.map((item) => item.city).filter(Boolean))]
  const unpinned = arranged.filter((item) => !believable(item)).length
  const showList = wide || mobileView === 'list'
  const showMap = wide || mobileView === 'map'

  const eventIds = useMemo(() => [...new Set(items.filter((i) => i.kind === 'event').map((i) => i.id))].sort().join(','), [items])
  useEffect(() => {
    if (!eventIds) { setPicks({}); return }
    fetch(`/api/local-ads/itinerary?ids=${encodeURIComponent(eventIds)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setPicks(d?.picks ?? {}))
      .catch((err) => console.error('Could not load sponsored stops:', err))
  }, [eventIds])
  const legPicks = (from: ItineraryItem, to: ItineraryItem) => {
    const list = [...(from.kind === 'event' ? picks[from.id] ?? [] : []), ...(to.kind === 'event' ? picks[to.id] ?? [] : [])]
    return list.filter((p, n) => list.findIndex((q) => q.id === p.id) === n)
  }
  const countViews = (list: RoutePick[]) =>
    fetch('/api/local-ads/itinerary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: list.map((p) => p.id) }), keepalive: true })
      .catch((err) => console.error('Sponsored stop view count failed:', err))
  const addPick = (p: RoutePick, from: ItineraryItem, to: ItineraryItem) => {
    const place = p.address ?? (p.venue ? `${p.businessName}, ${p.venue}` : p.businessName)
    add({ id: pickStopId(p), kind: 'custom', adId: p.id, title: p.businessName, date: from.date, ...slotBetween(from, to), venueName: p.businessName, suburb: null, place, city: from.city ?? to.city ?? null, note: null })
  }

  const addCustom = (v: StopFormValues) => {
    const where = v.where || null
    add({ id: `custom-${Date.now()}`, kind: 'custom', title: v.title, date: v.date, time: v.time, endTime: v.endTime, venueName: where, suburb: null, place: where, note: v.note || null, stopCategory: v.category || null })
  }
  const saveEdit = (i: ItineraryItem, v: StopFormValues) => {
    const where = v.where || null
    const moved = where !== (i.place ?? i.venueName ?? null)
    update(i.id, { title: v.title, date: v.date, time: v.time, endTime: v.endTime, venueName: where, place: where, note: v.note || null, stopCategory: v.category || null, ...(moved ? { lat: null, lng: null, geoFailed: false, suburb: null } : {}) })
    setEditing(null)
  }
  const move = (id: string, dir: -1 | 1) => {
    const day = arranged.find((item) => item.id === id)?.date
    if (!day) return
    const dayItems = arranged.filter((item) => item.date === day)
    const index = dayItems.findIndex((item) => item.id === id)
    const next = index + dir
    if (next < 0 || next >= dayItems.length) return
    const copy = [...dayItems]
    const [row] = copy.splice(index, 1)
    copy.splice(next, 0, row)
    copy.forEach((stop, n) => update(stop.id, { order: n }))
  }
  const selectStop = (id: string) => {
    setActiveId(id)
    if (!wide) setMobileView('list')
    requestAnimationFrame(() => document.getElementById(`stop-${id}`)?.scrollIntoView({ block: 'center' }))
  }

  useEffect(() => {
    const q = eventQuery.trim()
    if (panel !== 'event' || q.length < 2) { setEventHits([]); return }
    const handle = window.setTimeout(() => {
      setEventBusy(true)
      const params = new URLSearchParams({ search: q, limit: '8' })
      const city = arranged.find((item) => item.city)?.city
      if (city) params.set('city', city)
      fetch(`/api/events?${params}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data) => setEventHits(data?.events ?? []))
        .catch(() => setEventHits([]))
        .finally(() => setEventBusy(false))
    }, 300)
    return () => window.clearTimeout(handle)
  }, [eventQuery, panel, arranged])

  const findNearby = () => {
    const anchor = [...arranged].reverse().find(believable)
    setNearbyBusy(true)
    setNearbyNote('')
    setNearbyHits([])
    const run = (origin: { lat: number; lng: number; city: string | null }) => {
      const day = arranged[0]?.date
      const params = new URLSearchParams({ limit: '80' })
      if (origin.city) params.set('city', origin.city)
      if (day) { params.set('dateFrom', day); params.set('dateTo', day) }
      fetch(`/api/events?${params}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data) => {
          const ranked = ((data?.events ?? []) as Hit[])
            .filter((ev) => ev.latitude != null && ev.longitude != null && !has(ev.id))
            .map((ev) => ({ ...ev, km: distanceKm(origin, { lat: ev.latitude as number, lng: ev.longitude as number }) }))
            .filter((ev) => ev.km <= 8 && coordsFitCity(ev.latitude as number, ev.longitude as number, ev.city))
            .sort((a, b) => a.km - b.km)
            .slice(0, 8)
          setNearbyHits(ranked)
          if (!ranked.length) setNearbyNote('Nothing else with a solid map pin within about 8 km that day.')
        })
        .catch(() => setNearbyNote('Couldn’t load events just now. Give it another go.'))
        .finally(() => setNearbyBusy(false))
    }
    if (anchor?.lat != null && anchor.lng != null) {
      run({ lat: anchor.lat, lng: anchor.lng, city: anchor.city ?? null })
      return
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setNearbyBusy(false)
      setNearbyNote('Add a stop with an address first. This browser won’t share where you are.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => run({ lat: pos.coords.latitude, lng: pos.coords.longitude, city: null }),
      () => { setNearbyBusy(false); setNearbyNote('No pin to start from, and location’s off. Add a place to a stop and we’ll look from there.') },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }

  const share = async () => {
    const text = [title, ...arranged.map((item) => `${clock(item.time) ?? 'Time not set'} · ${item.title}${item.venueName ? ` · ${item.venueName}` : ''}`)].join('\n')
    try {
      if (navigator.share) { await navigator.share({ title, text }); return }
      await navigator.clipboard.writeText(text)
      toast.success('Plan’s copied. Send it.')
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return
      toast('Couldn’t share that just now')
    }
  }

  const openPanel = (next: 'event' | 'custom' | 'nearby') => {
    setPanel(next)
    if (next === 'nearby') findNearby()
    requestAnimationFrame(() => agendaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar savedCount={saved.length} />
      <main className="vp-wrap px-4 py-6 sm:px-6 lg:py-8">
        <PageMasthead variant="itinerary" />

        {!arranged.length ? (
          <div className="mt-8">
            <div className="rounded-3xl border border-[#FF4E6A]/20 bg-[#fff5f6] px-4 py-8 text-center dark:bg-[#2a1218] sm:px-8">
              <CalendarPlusIcon className="mx-auto h-8 w-8 text-primary" aria-hidden />
              <h2 className="mt-3 font-display text-3xl font-bold">Nothing lined up yet.</h2>
              <p className="mx-auto mt-2 max-w-lg text-muted-foreground">Spot something worth leaving the house for, add it here, and stack the rest around it.</p>
              <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">Stays on this device while you’re signed in. Clears when you sign out. Separate from Saved.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => openPanel('event')} className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">Start planning.</button>
                {status !== 'authenticated' && <Link href="/login?next=/itinerary" className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm font-semibold">Sign in</Link>}
              </div>
            </div>
            <aside className="mt-6 rounded-2xl border border-dashed border-border bg-muted/40 p-4" aria-label="Example itinerary">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Example only. Not your plan, and not a real listing.</p>
              <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>Evening · A gig</li>
                <li>Later · Dinner</li>
                <li>After · One more stop</li>
              </ol>
            </aside>
          </div>
        ) : (
          <>
            <section className="mt-6 rounded-3xl border border-border bg-card p-4 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  {naming ? (
                    <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); saveLabel(nameDraft); setNaming(false) }}>
                      <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={80} aria-label="Itinerary name" className="h-11 min-w-[16rem] rounded-full border border-border bg-background px-4 text-sm" />
                      <button type="submit" className="h-11 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">Save Name</button>
                      <button type="button" onClick={() => setNaming(false)} className="h-11 rounded-full border border-border px-4 text-sm">Cancel</button>
                    </form>
                  ) : <h2 className="font-display text-2xl font-bold sm:text-3xl">{title}</h2>}
                  <p className="mt-2 text-sm text-muted-foreground">
                    {days.length === 1 ? dayLabel(days[0]) : `${days.length} days`}
                    {' · '}{arranged.length} {arranged.length === 1 ? 'stop' : 'stops'}
                    {clock(start) ? ` · Starts ${clock(start)}` : ''}
                    {clock(finish) ? ` · Finishes ${clock(finish)}` : ''}
                    {cities.length === 1 ? ` · ${cities[0]}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={share} className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-semibold"><Share2 className="h-4 w-4" /> Share</button>
                  <button type="button" onClick={() => { setNameDraft(label || title); setNaming(true) }} className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-semibold"><Pencil className="h-4 w-4" /> Rename Plan</button>
                  <details className="relative">
                    <summary className="flex h-11 cursor-pointer list-none items-center rounded-full border border-border px-4 text-sm font-semibold">More options</summary>
                    <button type="button" onClick={() => { if (confirm('Clear the whole plan?')) clear() }} className="absolute right-0 z-10 mt-2 whitespace-nowrap rounded-xl border border-border bg-popover px-4 py-3 text-sm shadow-lg">Clear all</button>
                  </details>
                </div>
              </div>
            </section>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <ViewToggle value={wide ? focusPane : mobileView} onChange={(next) => { setFocusPane(next); setMobileView(next); if (wide) document.getElementById(next === 'map' ? 'itinerary-map' : 'itinerary-timeline')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} listLabel="Timeline" mapLabel="Map" label="Itinerary view" />
              {showMap && <button type="button" onClick={() => setMapFull((on) => !on)} className="h-11 rounded-full border border-border px-4 text-sm font-semibold lg:hidden">{mapFull ? 'Shrink map' : 'Full-screen map'}</button>}
            </div>

            <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)] lg:items-start lg:gap-6">
              {showList && (
                <div id="itinerary-timeline" className="space-y-8 scroll-mt-28">
                  {days.map((d) => (
                    <section key={d}>
                      <h3 className="mb-3 font-display text-lg font-semibold">{dayLabel(d)}</h3>
                      <ol className="relative ml-4 space-y-4 border-l-2 border-primary/30">
                        {arranged.filter((i) => i.date === d).map((i, idx, dayItems) => {
                          const duration = durationLabel(i.time, i.endTime)
                          return (
                            <li key={i.id} id={`stop-${i.id}`} className="ml-6">
                              {idx > 0 && <TravelLeg from={dayItems[idx - 1]} to={i} locating={locating} />}
                              {idx > 0 && <RoutePicks picks={legPicks(dayItems[idx - 1], i)} isAdded={(p) => items.some((x) => x.id === pickStopId(p))} onAdd={(p) => addPick(p, dayItems[idx - 1], i)} onOpen={countViews} />}
                              <div className={`relative rounded-2xl bg-card p-4 shadow-[var(--shadow-md)] ${activeId === i.id ? 'ring-2 ring-primary' : ''}`}>
                                <span className="absolute -left-[34px] top-5 grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{arranged.findIndex((stop) => stop.id === i.id) + 1}</span>
                                {editing === i.id ? (
                                  <>
                                    <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><Pencil className="h-4 w-4 text-primary" />Tweak your stop</p>
                                    <StopForm showCategory initial={{ title: i.title, date: i.date, time: i.time ?? '', endTime: i.endTime ?? '', where: i.place ?? i.venueName ?? '', note: i.note ?? '', category: i.stopCategory ?? '' }} submitLabel="Save Stop" onSubmit={(v) => saveEdit(i, v)} onCancel={() => setEditing(null)} />
                                  </>
                                ) : (
                                  <>
                                    <div className="flex items-start justify-between gap-3">
                                      <button type="button" onClick={() => setActiveId(i.id)} className="min-w-0 text-left">
                                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Clock className="h-3.5 w-3.5" />{boardClockLine(i) ?? 'Time not set'}{duration ? ` · ${duration}` : ''}</p>
                                        {i.kind === 'event' ? <Link href={i.href ?? eventPath(i)} className="font-semibold hover:text-primary">{i.title}</Link> : <p className="font-semibold">{i.title}</p>}
                                        {i.venueName && <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{i.venueName}{i.suburb ? ` · ${i.suburb}` : ''}</p>}
                                        {(i.place && i.place !== i.venueName) && <p className="text-sm text-muted-foreground">{i.place}</p>}
                                        <p className="mt-1 flex flex-wrap gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                          {i.kind === 'custom' && <span className="rounded bg-muted px-1.5 py-0.5">My stop</span>}
                                          {i.stopCategory && <span className="rounded bg-muted px-1.5 py-0.5">{i.stopCategory}</span>}
                                          {i.adId && <span>Sponsored</span>}
                                          {!believable(i) && <span>No map pin</span>}
                                        </p>
                                      </button>
                                      <div className="flex shrink-0">
                                        <button type="button" onClick={() => move(i.id, -1)} disabled={idx === 0} aria-label={`Move ${i.title} earlier in the list`} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                                        <button type="button" onClick={() => move(i.id, 1)} disabled={idx === dayItems.length - 1} aria-label={`Move ${i.title} later in the list`} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                                        <button type="button" onClick={() => downloadIcs([i], i.title)} aria-label={`Add ${i.title} to your calendar`} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted"><CalendarPlus className="h-4 w-4" /></button>
                                        {i.kind === 'custom' && <button type="button" onClick={() => setEditing(i.id)} aria-label={`Edit ${i.title}`} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted"><Pencil className="h-4 w-4" /></button>}
                                        <button type="button" onClick={() => remove(i.id)} aria-label={`Remove ${i.title}`} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted"><Trash2 className="h-4 w-4" /></button>
                                      </div>
                                    </div>
                                    {i.adId && <a href={`/api/local-ads/${i.adId}/go`} target="_blank" rel="sponsored noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">Visit website<ExternalLink className="h-3 w-3" /></a>}
                                    {i.kind === 'custom' && i.time && !i.endTime && (
                                      <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">When does this wrap up?
                                        <input type="time" onChange={(e) => e.target.value && update(i.id, { endTime: e.target.value })} className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground" aria-label={`End time for ${i.title}`} />
                                      </label>
                                    )}
                                    {clash.has(i.id) && (
                                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-700 dark:text-amber-400">
                                        <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />Clashes with another stop today</span>
                                        <button type="button" onClick={() => dismissClash(i)} className="font-semibold underline underline-offset-2 hover:text-foreground">All good, I’ll head off early. Hide this</button>
                                      </div>
                                    )}
                                    <input key={i.note ?? ''} defaultValue={i.note ?? ''} onBlur={(e) => update(i.id, { note: e.target.value.slice(0, 300) || null })} placeholder="Add a note (who's coming, where to meet…)" className="mt-3 w-full rounded-md bg-muted/50 px-3 py-2 text-sm" aria-label={`Note for ${i.title}`} />
                                  </>
                                )}
                              </div>
                            </li>
                          )
                        })}
                      </ol>
                    </section>
                  ))}
                  <p className="text-xs text-muted-foreground">Rough distances, not a traffic report. Directions has the live route.{unpinned > 0 ? ` ${unpinned} ${unpinned === 1 ? 'stop is' : 'stops are'} off the map until there’s a pin we trust.` : ''}</p>
                </div>
              )}
              {showMap && (
                <div id="itinerary-map" className={`relative scroll-mt-28 overflow-hidden rounded-3xl border border-border bg-muted ${mapFull ? 'h-[100dvh]' : 'h-[70vh] min-h-[420px]'} lg:sticky lg:top-24`}>
                  <ItineraryMap stops={arranged} activeId={activeId} onSelect={selectStop} />
                </div>
              )}
            </div>
          </>
        )}

        <section ref={agendaRef} className="mt-10 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold">What’s next on the agenda?</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <button type="button" onClick={() => openPanel('event')} className="rounded-2xl border border-border bg-card p-4 text-left hover:border-primary">
              <Search className="h-5 w-5 text-primary" />
              <p className="mt-2 font-semibold">Add something from the board</p>
              <p className="mt-1 text-sm text-muted-foreground">Search what’s on and drop it in.</p>
            </button>
            <button type="button" onClick={() => openPanel('custom')} className="rounded-2xl border border-border bg-card p-4 text-left hover:border-primary">
              <Plus className="h-5 w-5 text-primary" />
              <p className="mt-2 font-semibold">Add your own stop</p>
              <p className="mt-1 text-sm text-muted-foreground">Dinner, a meet-up, the bit in between.</p>
            </button>
            <button type="button" onClick={() => openPanel('nearby')} className="rounded-2xl border border-border bg-card p-4 text-left hover:border-primary">
              <MapPin className="h-5 w-5 text-primary" />
              <p className="mt-2 font-semibold">Find something nearby</p>
              <p className="mt-1 text-sm text-muted-foreground">More things on, within about 8 km of your last pin.</p>
            </button>
          </div>
          {panel === 'event' && (
            <div className="mt-4 rounded-2xl border border-border bg-card p-4">
              <label className="text-sm font-semibold">Find an event
                <input value={eventQuery} onChange={(e) => setEventQuery(e.target.value)} placeholder="Artist, venue, jazz…" className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" />
              </label>
              {eventBusy && <p className="mt-3 text-sm text-muted-foreground">Looking…</p>}
              <ul className="mt-3 space-y-2">
                {eventHits.map((ev) => (
                  <li key={ev.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2">
                    <span className="min-w-0"><span className="block truncate font-semibold">{ev.title}</span><span className="block truncate text-xs text-muted-foreground">{ev.venueName}</span></span>
                    <button type="button" disabled={has(ev.id)} onClick={() => add(eventToItem(ev))} className="h-9 shrink-0 rounded-full bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{has(ev.id) ? 'Added' : 'Add'}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {panel === 'custom' && (
            <div className="mt-4 rounded-2xl border border-border bg-card p-4">
              <StopForm showCategory initial={emptyStop} submitLabel="Add Stop" onSubmit={addCustom} keepDate />
            </div>
          )}
          {panel === 'nearby' && (
            <div className="mt-4 rounded-2xl border border-border bg-card p-4">
              {nearbyBusy && <p className="text-sm text-muted-foreground">Looking nearby…</p>}
              {nearbyNote && <p className="text-sm text-muted-foreground">{nearbyNote}</p>}
              <ul className="mt-3 space-y-2">
                {nearbyHits.map((ev) => (
                  <li key={ev.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2">
                    <span className="min-w-0"><span className="block truncate font-semibold">{ev.title}</span><span className="block truncate text-xs text-muted-foreground">{ev.venueName} · {ev.km < 1 ? `${Math.round(ev.km * 1000)} m` : `${ev.km.toFixed(1)} km`}</span></span>
                    <button type="button" onClick={() => add(eventToItem(ev))} className="h-9 shrink-0 rounded-full bg-primary px-3 text-sm font-semibold text-primary-foreground">Add</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="mt-8 rounded-3xl bg-[#0c0f0e] px-5 py-6 text-white">
          <h2 className="font-display text-2xl font-bold">Good plans are better shared.</h2>
          <p className="mt-2 max-w-2xl text-sm text-white/75">Send the plan, or drop the whole thing in your calendar.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={share} disabled={!arranged.length} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Share2 className="h-4 w-4" /> Share itinerary</button>
            <button type="button" onClick={() => downloadIcs(arranged, title)} disabled={!arranged.length} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-neutral-900 disabled:opacity-50"><CalendarPlus className="h-4 w-4" /> Add to calendar</button>
          </div>
        </section>
      </main>
      <Footer lastRefresh={null} />
    </div>
  )
}
