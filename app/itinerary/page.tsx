'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { CalendarRange, Trash2, AlertTriangle, Plus, MapPin, Clock, Footprints, Car, Navigation, Loader2, Pencil, ExternalLink } from 'lucide-react'
import { eventPath } from '@/lib/seo'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { useSaved } from '@/lib/saved'
import { useItinerary, sortItinerary, clashMap, type ItineraryItem } from '@/lib/itinerary'
import { estimateLeg, fmtKm, fmtMin, directionsUrl } from '@/lib/travel'
import { StopForm, emptyStop, type StopFormValues } from './stop-form'
import { RoutePicks, pickStopId, slotBetween, type RoutePick } from './route-picks'
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const toMin = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null)
const hasGeo = (i: ItineraryItem) => i.lat != null && i.lng != null
const needsGeo = (i: ItineraryItem) => !hasGeo(i) && !i.geoFailed && (i.kind === 'event' || !!(i.place || i.venueName))

/** Travel estimate between two consecutive stops on the same day. */
function TravelLeg({ from, to, locating }: { from: ItineraryItem; to: ItineraryItem; locating: boolean }) {
  const box = 'ml-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground py-1'
  if (!hasGeo(from) || !hasGeo(to)) {
    if (locating) return <div className={box}><Loader2 className="w-3.5 h-3.5 animate-spin" />Working out travel time…</div>
    const missing = !hasGeo(from) ? from : to
    return <div className={box}><Navigation className="w-3.5 h-3.5" />{missing.kind === 'custom' && !missing.place && !missing.venueName ? `Add a location to “${missing.title}” to see travel time` : `Couldn’t map “${missing.title}”, so no travel time`}</div>
  }
  const a = { lat: from.lat!, lng: from.lng! }, b = { lat: to.lat!, lng: to.lng! }
  const leg = estimateLeg(a, b)
  if (leg.km < 0.05) return <div className={box}><MapPin className="w-3.5 h-3.5" />Same location</div>
  const leave = toMin(from.endTime), arrive = toMin(to.time)
  const gap = leave !== null && arrive !== null ? arrive - leave : null
  const tight = gap !== null && gap >= 0 && gap < leg.recommendedMin
  return (
    <div className={box}>
      <span className="font-medium text-foreground">{fmtKm(leg.km)}</span>
      <span className="inline-flex items-center gap-1"><Footprints className="w-3.5 h-3.5" />≈ {fmtMin(leg.walkMin)} walk</span>
      <span className="inline-flex items-center gap-1"><Car className="w-3.5 h-3.5" />≈ {fmtMin(leg.driveMin)} drive</span>
      <a href={directionsUrl(a, b, leg.mode === 'walking' ? 'walking' : 'transit')} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><Navigation className="w-3.5 h-3.5" />Directions</a>
      {tight && <span className="basis-full inline-flex items-center gap-1 text-amber-700 dark:text-amber-400"><AlertTriangle className="w-3.5 h-3.5" />Tight: {gap} min between stops, travel takes about {fmtMin(leg.recommendedMin)}</span>}
    </div>
  )
}

export default function ItineraryPage() {
  const { saved } = useSaved()
  const { items, add, remove, update, clear } = useItinerary()
  const [editing, setEditing] = useState<string | null>(null)
  const [picks, setPicks] = useState<Record<string, RoutePick[]>>({})
  const [locating, setLocating] = useState(false)
  const inFlight = useRef(false)

  // Fill in coordinates for stops added before travel times existed, or custom stops with a typed location.
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
          update(i.id, g ? { lat: g.lat, lng: g.lng } : { geoFailed: true })
        }
      })
      .catch((err) => console.error('Could not locate itinerary stops:', err))
      .finally(() => { inFlight.current = false; setLocating(false) })
  }, [items, update])
  const sorted = sortItinerary(items)
  const clash = clashMap(sorted)
  const dismissClash = (i: ItineraryItem) => update(i.id, { okWith: [...new Set([...(i.okWith ?? []), ...(clash.get(i.id) ?? [])])] })
  const days = [...new Set(sorted.map((i) => i.date))]

  // Paid local recommendations attached to the events in this itinerary (shown collapsed between stops).
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
    add({ id: `custom-${Date.now()}`, kind: 'custom', title: v.title, date: v.date, time: v.time, endTime: v.endTime, venueName: where, suburb: null, place: where, note: v.note || null })
  }
  const saveEdit = (i: ItineraryItem, v: StopFormValues) => {
    const where = v.where || null
    const moved = where !== (i.place ?? i.venueName ?? null)
    update(i.id, { title: v.title, date: v.date, time: v.time, endTime: v.endTime, venueName: where, place: where, note: v.note || null, ...(moved ? { lat: null, lng: null, geoFailed: false, suburb: null } : {}) })
    setEditing(null)
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar savedCount={saved.length} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h1 className="font-display text-3xl font-bold flex items-center gap-3"><CalendarRange className="w-7 h-7 text-primary" />Itinerary</h1>
          {items.length > 0 && <button onClick={() => { if (confirm('Clear your whole itinerary?')) clear() }} className="text-sm text-muted-foreground hover:text-foreground">Clear all</button>}
        </div>
        <p className="text-muted-foreground mb-8">Your game plan. Tap <span className="font-semibold text-foreground">+ Add to My Itinerary</span> on any event, and add your own stops like dinner or a meet-up. Your itinerary is kept on this device. It is separate from your saved favourites.</p>

        {!sorted.length ? (
          <div className="rounded-xl bg-card shadow-[var(--shadow-md)] p-8 text-center">
            <p className="font-semibold mb-2">No plans yet? Let’s fix that.</p>
            <Link href="/" className="text-primary underline">Browse events</Link>
          </div>
        ) : (
          <div className="space-y-8">
            {days.map((d) => (
              <section key={d}>
                <h2 className="font-display font-semibold text-lg mb-3">{dayLabel(d)}</h2>
                <ol className="relative border-l-2 border-primary/30 ml-2 space-y-4">
                  {sorted.filter((i) => i.date === d).map((i, idx, dayItems) => (
                    <li key={i.id} className="ml-5">
                      {idx > 0 && <TravelLeg from={dayItems[idx - 1]} to={i} locating={locating} />}
                      {idx > 0 && <RoutePicks picks={legPicks(dayItems[idx - 1], i)} isAdded={(p) => items.some((x) => x.id === pickStopId(p))} onAdd={(p) => addPick(p, dayItems[idx - 1], i)} onOpen={countViews} />}
                      <div className="relative rounded-xl bg-card shadow-[var(--shadow-md)] p-4">
                        <span className="absolute -left-[27px] top-5 w-3 h-3 rounded-full bg-primary" />
                        {editing === i.id ? (
                          <>
                            <p className="font-semibold text-sm mb-3 flex items-center gap-2"><Pencil className="w-4 h-4 text-primary" />Tweak your stop</p>
                            <StopForm initial={{ title: i.title, date: i.date, time: i.time ?? '', endTime: i.endTime ?? '', where: i.place ?? i.venueName ?? '', note: i.note ?? '' }} submitLabel="Save Changes" onSubmit={(v) => saveEdit(i, v)} onCancel={() => setEditing(null)} />
                          </>
                        ) : (<>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{i.time ? `${i.time}${i.endTime ? ` – ${i.endTime}` : ''}` : 'Time not set'}{i.kind === 'custom' && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold">MY STOP</span>}{i.adId && <span className="ml-1 text-[10px] uppercase tracking-wide">Sponsored</span>}</p>
                            {i.kind === 'event' ? <Link href={i.href ?? eventPath(i)} className="font-semibold hover:text-primary">{i.title}</Link> : <p className="font-semibold">{i.title}</p>}
                            {i.venueName && <p className="text-sm text-muted-foreground flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{i.venueName}{i.suburb ? ` · ${i.suburb}` : ''}</p>}
                            {i.adId && <a href={`/api/local-ads/${i.adId}/go`} target="_blank" rel="sponsored noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">Visit website<ExternalLink className="w-3 h-3" /></a>}
                          </div>
                          <div className="flex shrink-0">
                            {i.kind === 'custom' && <button type="button" onClick={() => setEditing(i.id)} aria-label={`Edit ${i.title}`} className="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"><Pencil className="w-4 h-4" /></button>}
                            <button type="button" onClick={() => remove(i.id)} aria-label={`Remove ${i.title}`} className="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                        {i.kind === 'custom' && i.time && !i.endTime && (
                          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">When does this wrap up?
                            <input type="time" onChange={(e) => e.target.value && update(i.id, { endTime: e.target.value })} className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground" aria-label={`End time for ${i.title}`} />
                          </label>
                        )}
                        {clash.has(i.id) && (
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-700 dark:text-amber-400">
                            <span className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />Overlaps another stop on this day</span>
                            <button type="button" onClick={() => dismissClash(i)} className="font-semibold underline underline-offset-2 hover:text-foreground">All good, I&apos;ll head off early. Hide this</button>
                          </div>
                        )}
                        <input key={i.note ?? ''} defaultValue={i.note ?? ''} onBlur={(e) => update(i.id, { note: e.target.value.slice(0, 300) || null })} placeholder="Add a note (who's coming, where to meet…)" className="mt-3 w-full text-sm bg-muted/50 rounded-md px-3 py-2" aria-label="Note" />
                        </>)}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
            <p className="text-xs text-muted-foreground">Travel times are rough estimates based on the distance between stops. They don&apos;t include traffic or timetables, so tap <span className="font-medium">Directions</span> for a live route.</p>
          </div>
        )}

        <section className="mt-10 rounded-xl bg-card shadow-[var(--shadow-md)] p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><Plus className="w-4 h-4" />Add your own stop</h2>
          <StopForm initial={emptyStop} submitLabel="Add Stop" onSubmit={addCustom} keepDate />
        </section>
      </main>
      <Footer lastRefresh={null} />
    </div>
  )
}
