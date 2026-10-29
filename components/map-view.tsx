'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useTheme } from 'next-themes'
import { FilterState } from '@/components/filter-panel'
import { Loader2, LocateFixed, X } from 'lucide-react'
import { eventPath } from '@/lib/seo'
import { CATEGORIES, knownCategories } from '@/lib/categories'
import { cityDef } from '@/lib/cities'
import { formatPrice } from '@/lib/board'
import { MAP_ATTRIBUTION, MAP_MAX_ZOOM, MAP_TILE } from '@/lib/map-style'
import { loadLeaflet } from '@/lib/load-leaflet'
import { isPaidListing } from '@/lib/quality'
import { VibePeepMascot } from '@/components/vibepeep-mascot'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

interface MapViewProps {
  filters: FilterState
  searchQuery: string
  city?: string
  /** Fill the parent. Desktop gets a side list; mobile gets a card strip. */
  bleed?: boolean
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
const TILE = MAP_TILE

function popupHtml(e: any, tier?: string) {
  const date = new Date(e?.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const p = formatPrice(e?.isFree, e?.price, e?.priceMin, e?.priceMax)
  return `<div class="se-pop">${tier ? `<span class="se-pop-tier se-${tier.toLowerCase()}">${esc(tier)}</span>` : ''}
    <div class="se-pop-title">${esc(e?.title)}</div>
    <div class="se-pop-meta">${esc(date)}${e?.time ? ` · ${esc(e.time)}` : ''}<br/>${esc(e?.venueName)}</div>
    <div class="se-pop-row"><span class="se-pop-price ${p.kind === 'free' ? 'free' : ''}">${esc(p.prefix ? `${p.prefix} ` : '')}${esc(p.value)}</span>
    <a href="${esc(eventPath({ id: String(e?.id ?? ''), title: e?.title }))}">Details →</a></div></div>`
}

function markerIcon(L: any, color: string, letter: string, tier?: string) {
  const size = tier === 'GOLD' ? 44 : tier === 'BRONZE' ? 36 : 26
  const bg = tier === 'GOLD' ? '#F5B700' : color
  return L.divIcon({
    className: 'se-marker-wrap',
    html: `<div class="se-marker ${tier ? `se-marker-${tier.toLowerCase()}` : ''}" style="width:${size}px;height:${size}px;background:${bg}">${tier === 'GOLD' ? '★' : esc(letter)}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

const LOC_KEY = 'outza-location-v1' // 'granted' | 'declined' (consent only, coordinates are never stored)
type LocState = 'idle' | 'asking' | 'locating' | 'found' | 'denied' | 'unavailable'

export function MapView({ filters, searchQuery, city = '', bleed = false }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const tileRef = useRef<any>(null)
  const markersRef = useRef<any>(null)
  const markerById = useRef<Map<string, any>>(new Map())
  const goldRef = useRef<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [featured, setFeatured] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const youRef = useRef<any>(null)
  const Lref = useRef<any>(null)
  const fetchSeq = useRef(0)
  const [loc, setLoc] = useState<LocState>('idle')
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme !== 'light'

  const fetchEvents = useCallback(async () => {
    const seq = ++fetchSeq.current
    try {
      setLoading(true)
      setEvents([])
      setFeatured([])
      const params = new URLSearchParams()
      params.set('limit', '300')
      if (city) params.set('city', city)
      if (searchQuery) params.set('search', searchQuery)
      const cats = knownCategories(filters.categories?.length ? filters.categories : filters.category ? [filters.category] : [])
      if (cats.length === 1) params.set('category', cats[0])
      else if (cats.length > 1) params.set('categories', cats.join(','))
      if (filters.subTag) params.set('subTag', filters.subTag)
      if (filters.suburb) params.set('suburb', filters.suburb)
      if (filters.isFree) params.set('isFree', 'true')
      if (filters.isLGBTI) params.set('isLGBTI', 'true')
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
      if (filters.dateTo) params.set('dateTo', filters.dateTo)
      const [res, feat] = await Promise.all([
        fetch(`/api/events?${params.toString()}`).then((r) => r.json()),
        fetch(`/api/featured${city ? `?city=${encodeURIComponent(city)}` : ''}`).then((r) => r.json()).catch(() => ({ items: [] })),
      ])
      if (seq !== fetchSeq.current) return
      const list = (res?.events ?? []).filter((ev: { price?: string | null; priceMin?: number | null }) => !filters.isFree || !isPaidListing(ev))
      setEvents(list)
      setFeatured(feat?.items ?? [])
    } catch (err) {
      console.error('Failed to fetch events for map:', err)
    } finally {
      if (seq === fetchSeq.current) setLoading(false)
    }
  }, [searchQuery, filters, city])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  // Create the map once Leaflet has loaded
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const Leaflet = await loadLeaflet()
      if (cancelled || !mapRef.current || mapInstanceRef.current) return
      Lref.current = Leaflet
      const map = Leaflet.map(mapRef.current, { zoomControl: false }).setView([-33.8688, 151.2093], 12)
      Leaflet.control.zoom({ position: 'bottomright' }).addTo(map)
      mapInstanceRef.current = map
      setReady(true)
    })()
    return () => {
      cancelled = true
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null }
    }
  }, [])

  // Theme-aware CARTO basemap
  useEffect(() => {
    const map = mapInstanceRef.current
    const L = Lref.current
    if (!ready || !map || !L) return
    if (tileRef.current) map.removeLayer(tileRef.current)
    tileRef.current = L.tileLayer(TILE(dark), {
      attribution: MAP_ATTRIBUTION,
      maxZoom: MAP_MAX_ZOOM,
    }).addTo(map)
  }, [ready, dark])

  // Re-centre when the city changes
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!ready || !map) return
    if (city) { const c = cityDef(city); map.setView([c.lat, c.lng], 12) }
    else map.setView([-27.5, 134], 4)
  }, [ready, city])

  // Zoom to the visitor's own location (only after they've opted in; used in the browser only)
  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setLoc('unavailable'); return }
    setLoc('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        try { localStorage.setItem(LOC_KEY, 'granted') } catch {}
        const map = mapInstanceRef.current
        if (!map) return
        const ll: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        if (youRef.current) map.removeLayer(youRef.current)
        const L = Lref.current
        if (!L) return
        youRef.current = L.marker(ll, {
          icon: L.divIcon({ className: 'se-you-wrap', html: '<div style="width:18px;height:18px;border-radius:9999px;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 6px rgba(59,130,246,.25)"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
          zIndexOffset: 2000, keyboard: false,
        }).bindTooltip('You are here').addTo(map)
        map.setView(ll, 14)
        setLoc('found')
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) { try { localStorage.setItem(LOC_KEY, 'declined') } catch {} ; setLoc('denied') }
        else setLoc('unavailable')
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }, [])

  useEffect(() => {
    if (!ready) return
    let pref: string | null = null
    try { pref = localStorage.getItem(LOC_KEY) } catch {}
    if (pref === 'granted') locate()
    else if (pref !== 'declined') setLoc('asking')
  }, [ready, locate])

  const declineLocation = () => { try { localStorage.setItem(LOC_KEY, 'declined') } catch {} ; setLoc('idle') }

  useEffect(() => {
    const map = mapInstanceRef.current
    const L = Lref.current
    if (!ready || !map || !L) return
    if (markersRef.current) map.removeLayer(markersRef.current)
    if (goldRef.current) map.removeLayer(goldRef.current)

    const tierById = new Map<string, string>(featured.map((f: any) => [f.id, f.tier]))
    markerById.current = new Map()
    const mcg = L.markerClusterGroup
      ? L.markerClusterGroup({
          showCoverageOnHover: false,
          iconCreateFunction: (cl: any) => L.divIcon({ className: 'se-cluster-wrap', html: `<div class="se-cluster">${cl.getChildCount()}</div>`, iconSize: [40, 40] }),
        })
      : L.layerGroup()
    const gold = L.layerGroup()

    for (const e of events) {
      if (!e?.latitude || !e?.longitude) continue
      const tier = e.promoTier ?? tierById.get(e.id)
      if (tier === 'GOLD') continue // gold rendered separately, always visible
      const color = CATEGORIES.find((c) => c.name === e?.category)?.color ?? '#FF7A1A'
      const m = L.marker([e.latitude, e.longitude], { icon: markerIcon(L, color, e?.category?.[0] ?? 'E', tier), zIndexOffset: tier === 'BRONZE' ? 500 : 0 })
        .bindPopup(popupHtml(e, tier), { className: 'se-popup', maxWidth: 280 })
      markerById.current.set(e.id, m)
      if (tier === 'BRONZE') gold.addLayer(m)
      else mcg.addLayer(m)
    }
    for (const f of featured) {
      if (f.tier !== 'GOLD' || !f.latitude || !f.longitude) continue
      const goldMarker = L.marker([f.latitude, f.longitude], { icon: markerIcon(L, '#F5B700', '★', 'GOLD'), zIndexOffset: 1000 })
        .bindPopup(popupHtml(f, 'GOLD'), { className: 'se-popup', maxWidth: 280 })
      markerById.current.set(f.id, goldMarker)
      gold.addLayer(goldMarker)
    }
    map.addLayer(mcg)
    map.addLayer(gold)
    markersRef.current = mcg
    goldRef.current = gold
  }, [events, featured, ready])

  const count = events.filter((e: any) => e?.latitude && e?.longitude).length
  const pinned = events.filter((e: any) => e?.latitude && e?.longitude).slice(0, 40)
  const focus = (e: any) => {
    const map = mapInstanceRef.current
    if (!map || !e?.latitude || !e?.longitude) return
    map.setView([e.latitude, e.longitude], 15)
    markerById.current.get(e.id)?.openPopup()
  }
  useEffect(() => {
    if (!ready) return
    const map = mapInstanceRef.current
    const id = requestAnimationFrame(() => map?.invalidateSize())
    return () => cancelAnimationFrame(id)
  }, [ready, bleed, pinned.length])
  return (
    <div className={bleed ? 'relative flex h-full min-h-0 w-full' : 'relative w-full h-[70vh] min-h-[420px] sm:h-[calc(100vh-200px)] sm:min-h-[500px]'}>
      {bleed && (
        <aside className="hidden h-full w-80 shrink-0 flex-col border-r border-border bg-background lg:flex">
          <div className="border-b border-border px-4 py-3">
            <p className="font-display text-lg font-bold">In view</p>
            <p className="text-xs text-muted-foreground">{loading ? 'Loading pins…' : `${count} events with a pin`}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {pinned.map((e) => {
              const price = formatPrice(e.isFree, e.price, e.priceMin, e.priceMax)
              return (
                <button key={e.id} type="button" onClick={() => focus(e)} className="block w-full border-b border-border px-4 py-3 text-left hover:bg-muted">
                  <span className="block truncate font-semibold">{e.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{e.time || 'All day'} · {e.venueName} · {price.value}</span>
                </button>
              )
            })}
            {!loading && pinned.length === 0 && <p className="px-4 py-8 text-sm text-muted-foreground">No pins match these filters.</p>}
          </div>
        </aside>
      )}
      <div className="relative min-h-0 min-w-0 flex-1">
      {loading && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center bg-background/40">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}
      <div ref={mapRef} className={bleed ? 'se-map h-full w-full overflow-hidden' : 'se-map w-full h-full rounded-2xl overflow-hidden'} />
      <div className={bleed ? 'absolute top-16 left-3 z-[500] max-w-[calc(100%-8rem)] truncate rounded-full px-4 py-2 text-sm font-medium bg-white/80 text-neutral-900 dark:bg-neutral-900/75 dark:text-white backdrop-blur-xl shadow-lg lg:hidden' : 'absolute top-4 left-1/2 z-[500] max-w-[calc(100%-7rem)] -translate-x-1/2 truncate rounded-full px-4 py-2 text-sm font-medium bg-white/80 text-neutral-900 dark:bg-neutral-900/75 dark:text-white backdrop-blur-xl shadow-lg sm:left-4 sm:max-w-none sm:translate-x-0'}>
        {loading ? <span>Loading map…</span> : <><span className="text-primary font-bold">{count}</span> events on map</>}
      </div>
      {!loading && count === 0 && (
        <div className="absolute inset-0 z-[450] flex items-center justify-center p-6 pointer-events-none">
          <div className="pointer-events-auto max-w-sm rounded-2xl bg-card/95 text-card-foreground shadow-xl ring-1 ring-border px-5 py-4 text-center">
            <VibePeepMascot className="mx-auto mb-2 w-20" alt="" />
            <p className="font-display font-bold text-lg">No pins from up here.</p>
            <p className="mt-1 text-sm text-muted-foreground">{searchQuery ? `Nothing matches “${searchQuery}” here. Try another city, or clear the search.` : 'Nothing with a map pin matches these filters. Try another city or loosen the filters.'}</p>
          </div>
        </div>
      )}
      {ready && (
        <button
          onClick={locate}
          disabled={loc === 'locating'}
          className={bleed ? 'absolute top-16 right-3 z-[500] inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold bg-white/90 text-neutral-900 dark:bg-neutral-900/80 dark:text-white backdrop-blur-xl shadow-lg lg:top-4' : 'absolute top-4 right-4 z-[500] inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold bg-white/90 text-neutral-900 dark:bg-neutral-900/80 dark:text-white backdrop-blur-xl shadow-lg hover:bg-white dark:hover:bg-neutral-900 disabled:opacity-60'}
          aria-label="Zoom to my location"
        >
          {loc === 'locating' ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <LocateFixed className="w-4 h-4 text-primary" />}
          <span className="hidden sm:inline">Near Me</span>
        </button>
      )}
      {loc === 'asking' && (
        <div className={bleed ? 'absolute left-4 right-4 bottom-36 z-[600] rounded-2xl bg-card text-card-foreground shadow-2xl ring-1 ring-border p-4 lg:bottom-4 lg:left-auto lg:right-4 lg:w-[340px]' : 'absolute left-4 right-4 bottom-20 sm:bottom-4 sm:left-auto sm:right-16 sm:w-[340px] z-[600] rounded-2xl bg-card text-card-foreground shadow-2xl ring-1 ring-border p-4'}>
          <button onClick={declineLocation} className="absolute top-2 right-2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
          <p className="font-display font-bold text-lg leading-tight pr-6">Where you at?</p>
          <p className="mt-1.5 text-sm text-muted-foreground">Share your location and we'll zoom straight to the action around you.</p>
          <p className="mt-2 text-xs text-muted-foreground">Your location is only used in your browser to centre the map. We don't store it.</p>
          <div className="mt-3 flex gap-2">
            <button onClick={locate} className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">Share My Location</button>
            <button onClick={declineLocation} className="h-10 px-4 rounded-lg border border-border text-sm font-medium hover:bg-muted">Not Now</button>
          </div>
        </div>
      )}
      {(loc === 'denied' || loc === 'unavailable') && (
        <div className={bleed ? 'absolute left-4 right-4 bottom-36 z-[600] rounded-xl bg-card p-3 pr-9 text-sm shadow-xl ring-1 ring-border lg:bottom-4 lg:left-auto lg:right-4 lg:w-[340px]' : 'absolute left-4 right-4 bottom-20 sm:bottom-4 sm:left-auto sm:right-16 sm:w-[340px] z-[600] rounded-xl bg-card text-card-foreground shadow-xl ring-1 ring-border p-3 pr-9 text-sm'}>
          <button onClick={() => setLoc('idle')} className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
          {loc === 'denied'
            ? 'No worries. Location access is off, so we\'ll stick to the city view. You can turn it on in your browser settings any time.'
            : 'We couldn\'t pin you down just now. Give Near Me another tap in a moment.'}
        </div>
      )}
      {bleed && (
        <div className="absolute inset-x-0 bottom-0 z-[550] flex gap-2 overflow-x-auto px-3 pb-3 pt-6 [scrollbar-width:none] lg:hidden bg-gradient-to-t from-background/80 to-transparent">
          {pinned.slice(0, 12).map((e) => {
            const price = formatPrice(e.isFree, e.price, e.priceMin, e.priceMax)
            return (
              <button key={e.id} type="button" onClick={() => focus(e)} className="w-44 shrink-0 rounded-xl border border-border bg-card p-3 text-left shadow-lg">
                <span className="block truncate text-sm font-semibold">{e.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{e.venueName}</span>
                <span className="mt-1 block font-mono text-xs">{price.value}</span>
              </button>
            )
          })}
        </div>
      )}
      </div>
    </div>
  )
}
