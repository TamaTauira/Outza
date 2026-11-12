'use client'

import { useEffect, useRef, useState, useCallback, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { FilterState } from '@/components/filter-panel'
import { Loader2, LocateFixed, X } from 'lucide-react'
import { eventPath } from '@/lib/seo'
import { CATEGORIES, knownCategories } from '@/lib/categories'
import { cityDef } from '@/lib/cities'
import { formatPrice } from '@/lib/board'
import { boardClockLine } from '@/lib/listing-window'
import { createBasemap } from '@/lib/map-basemap'
import { MAP_ATTRIBUTION, MAP_MAX_ZOOM } from '@/lib/map-style'
import { loadLeaflet } from '@/lib/load-leaflet'
import { isPaidListing } from '@/lib/quality'
import { ReachBeacon } from '@/components/reach-beacon'
import { VibePeepMascot } from '@/components/vibepeep-mascot'
import { eventPictureSrc, type PlaceholderSlot } from '@/lib/placeholders'
import { variantUrl, type ClientImage, type VariantKind } from '@/lib/images/spec'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

interface MapViewProps {
  filters: FilterState
  searchQuery: string
  city?: string
  /** Fill the parent. Desktop gets a side list; mobile gets a card strip. */
  bleed?: boolean
  /** Category chips. They sit in the map column, never over the list. */
  chips?: ReactNode
  /** When set, the map draws these records instead of fetching. Same pin, popup and cluster behaviour. */
  eventsOverride?: any[]
  focusId?: string | null
  onSelect?: (id: string) => void
  countNoun?: string
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

function pictureSrc(e: { imageUrl?: string | null; imageAsset?: ClientImage | null; category?: string | null }, slot: PlaceholderSlot) {
  const kind: VariantKind = slot === 'marker' || slot === 'square' ? 'square' : 'card'
  const m = e.imageAsset?.variants
  const widths = m?.sizes?.[kind]
  if (m && widths?.length) return variantUrl(m, kind, widths[widths.length - 1], 'webp')
  return eventPictureSrc(e.imageUrl, e.category, slot)
}

function holdingPicture(e: { imageUrl?: string | null; imageAsset?: ClientImage | null }, slot: PlaceholderSlot) {
  const kind: VariantKind = slot === 'marker' || slot === 'square' ? 'square' : 'card'
  const widths = e.imageAsset?.variants?.sizes?.[kind]
  if (widths?.length) return false
  return !(e.imageUrl && /^https?:\/\//i.test(e.imageUrl))
}

function popupHtml(e: any, tier?: string) {
  const date = new Date(e?.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const clock = boardClockLine(e)
  const p = formatPrice(e?.isFree, e?.price, e?.priceMin, e?.priceMax)
  const img = pictureSrc(e, 'popup')
  const imgClass = holdingPicture(e, 'popup') ? 'se-pop-hold' : 'se-pop-img'
  return `<div class="se-pop">${tier ? `<span class="se-pop-tier se-${tier.toLowerCase()}">${esc(tier)}</span>` : ''}
    <img class="${imgClass}" src="${esc(img)}" alt="" />
    <div class="se-pop-title">${esc(e?.title)}</div>
    <div class="se-pop-meta">${esc(date)}${clock ? ` · ${esc(clock)}` : ''}<br/>${esc(e?.venueName)}</div>
    <div class="se-pop-row"><span class="se-pop-price ${p.kind === 'free' ? 'free' : ''}">${esc(p.prefix ? `${p.prefix} ` : '')}${esc(p.value)}</span>
    <a data-event-peek="1" href="${esc(eventPath({ id: String(e?.id ?? ''), title: e?.title }))}">Details →</a></div></div>`
}

function markerIcon(L: any, e: { imageUrl?: string | null; imageAsset?: ClientImage | null; category?: string | null }, color: string, tier?: string) {
  const size = tier === 'GOLD' ? 44 : tier === 'BRONZE' ? 36 : 26
  const ring = tier === 'GOLD' ? '#F5B700' : '#fff'
  const src = pictureSrc(e, 'marker')
  return L.divIcon({
    className: 'se-marker-wrap',
    html: `<div class="se-marker ${tier ? `se-marker-${tier.toLowerCase()}` : ''}" style="width:${size}px;height:${size}px;background-color:${color};border-color:${ring};background-image:url('${esc(src)}')"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

const LOC_KEY = 'outza-location-v1' // 'granted' | 'declined' (consent only, coordinates are never stored)
type LocState = 'idle' | 'asking' | 'locating' | 'found' | 'denied' | 'unavailable'

export function MapView({ filters, searchQuery, city = '', bleed = false, chips = null, eventsOverride, focusId = null, onSelect, countNoun = 'events' }: MapViewProps) {
  const router = useRouter()
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
  const cardsRef = useRef<HTMLDivElement>(null)
  const [dock, setDock] = useState(0)
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme !== 'light'
  const locked = Array.isArray(eventsOverride)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    const openPeek = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[data-event-peek]')
      if (!(link instanceof HTMLAnchorElement)) return
      const href = link.getAttribute('href')
      if (!href) return
      event.preventDefault()
      router.push(href, { scroll: false })
    }
    document.addEventListener('click', openPeek)
    return () => document.removeEventListener('click', openPeek)
  }, [router])

  const categoryKey = knownCategories(filters.categories?.length ? filters.categories : filters.category ? [filters.category] : []).join('\u0000')
  const fetchEvents = useCallback(async () => {
    const seq = ++fetchSeq.current
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.set('limit', '300')
      if (city) params.set('city', city)
      if (searchQuery) params.set('search', searchQuery)
      const cats = categoryKey ? categoryKey.split('\u0000') : []
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
  }, [searchQuery, city, categoryKey, filters.subTag, filters.suburb, filters.isFree, filters.isLGBTI, filters.dateFrom, filters.dateTo])

  useEffect(() => { if (!locked) fetchEvents() }, [fetchEvents, locked])

  useEffect(() => {
    if (!locked) return
    setEvents(eventsOverride ?? [])
    setFeatured([])
    setLoading(false)
  }, [locked, eventsOverride])

  // Create the map once Leaflet has loaded
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const Leaflet = await loadLeaflet()
      if (cancelled || !mapRef.current || mapInstanceRef.current) return
      Lref.current = Leaflet
      const map = Leaflet.map(mapRef.current, { zoomControl: false, maxZoom: MAP_MAX_ZOOM }).setView([-33.8688, 151.2093], 12)
      Leaflet.control.zoom({ position: 'bottomright' }).addTo(map)
      map.attributionControl?.addAttribution(MAP_ATTRIBUTION)
      mapInstanceRef.current = map
      setReady(true)
    })()
    return () => {
      cancelled = true
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null }
    }
  }, [])

  useEffect(() => {
    const map = mapInstanceRef.current
    const L = Lref.current
    if (!ready || !map || !L) return
    let cancelled = false
    ;(async () => {
      try {
        const layer = await createBasemap(L, dark)
        if (cancelled) return
        if (tileRef.current) map.removeLayer(tileRef.current)
        tileRef.current = layer.addTo(map)
      } catch (err) {
        console.error('Map style failed to load:', err)
      }
    })()
    return () => { cancelled = true }
  }, [ready, dark])

  // Re-centre when the city changes
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!ready || !map) return
    if (locked) return
    if (city) { const c = cityDef(city); map.setView([c.lat, c.lng], 12) }
    else map.setView([-27.5, 134], 4)
  }, [ready, city, locked])

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
          spiderfyOnMaxZoom: true,
          zoomToBoundsOnClick: true,
          disableClusteringAtZoom: 17,
          maxClusterRadius: (zoom: number) => (zoom >= 15 ? 48 : zoom >= 13 ? 64 : 84),
          spiderfyDistanceMultiplier: 2,
          iconCreateFunction: (cl: any) => L.divIcon({
            className: 'se-cluster-wrap',
            html: `<div class="se-cluster">${cl.getChildCount()}</div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 20],
          }),
        })
      : L.layerGroup()

    const addMarker = (e: any, tier?: string) => {
      if (!e?.latitude || !e?.longitude) return
      const color = tier === 'GOLD' ? '#F5B700' : (CATEGORIES.find((c) => c.name === e?.category)?.color ?? '#FF7A1A')
      const m = L.marker([e.latitude, e.longitude], {
        icon: markerIcon(L, e, color, tier),
        title: e?.title,
        zIndexOffset: tier === 'GOLD' ? 1000 : tier === 'BRONZE' ? 500 : 0,
      }).bindPopup(popupHtml(e, tier), { className: 'se-popup', maxWidth: 280 })
      m.on('click', () => onSelectRef.current?.(e.id))
      markerById.current.set(e.id, m)
      mcg.addLayer(m)
    }

    for (const e of events) {
      const tier = e.promoTier ?? tierById.get(e.id)
      if (tier === 'GOLD' && !locked) continue
      addMarker(e, tier)
    }
    for (const f of featured) {
      if (f.tier !== 'GOLD') continue
      addMarker(f, 'GOLD')
    }
    map.addLayer(mcg)
    markersRef.current = mcg
    goldRef.current = null
    if (locked && typeof mcg.getBounds === 'function') {
      const bounds = mcg.getBounds()
      if (bounds?.isValid?.()) map.fitBounds(bounds.pad(0.25), { maxZoom: 14, animate: false })
    }
  }, [events, featured, ready, locked])

  const count = events.filter((e: any) => e?.latitude && e?.longitude).length
  const pinned = events.filter((e: any) => e?.latitude && e?.longitude).slice(0, 40)
  const showCards = bleed && pinned.length > 0
  useEffect(() => {
    const el = cardsRef.current
    if (!showCards || !el) { setDock(0); return }
    const measure = () => {
      const hidden = getComputedStyle(el).display === 'none' || el.getClientRects().length === 0
      setDock(hidden ? 0 : Math.ceil(el.getBoundingClientRect().height))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [showCards, pinned.length])
  const focus = (e: any) => {
    const map = mapInstanceRef.current
    if (!map || !e?.latitude || !e?.longitude) return
    map.setView([e.latitude, e.longitude], 15)
    markerById.current.get(e.id)?.openPopup()
  }
  useEffect(() => {
    if (!ready || !focusId) return
    const match = events.find((event) => event.id === focusId)
    if (match) focus(match)
    // Markers are rebuilt in the effect above. Re-open after that paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focusId, events])
  useEffect(() => {
    if (!ready) return
    const map = mapInstanceRef.current
    const id = requestAnimationFrame(() => map?.invalidateSize())
    return () => cancelAnimationFrame(id)
  }, [ready, bleed, pinned.length])
  const stageStyle = { '--vp-map-dock': `${dock}px` } as CSSProperties
  return (
    <div className={bleed ? 'relative flex h-full min-h-0 w-full' : 'relative h-[70vh] min-h-[420px] w-full sm:h-[calc(100vh-200px)] sm:min-h-[500px]'}>
      <ReachBeacon surface={searchQuery ? 'search' : 'map'} ids={events.map((event) => event.id)} term={searchQuery} />
      <div className={bleed ? 'flex min-h-0 min-w-0 flex-1' : 'h-full min-h-0'}>
      {bleed && (
        <aside className="vp-map-rail hidden h-full w-80 shrink-0 flex-col overflow-hidden border-r border-border bg-background lg:flex">
          <div className="shrink-0 border-b border-border px-4 py-3">
            <p className="font-display text-lg font-bold">In view</p>
            <p className="text-xs text-muted-foreground">{loading ? 'Loading pins…' : `${count} events with a pin`}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {pinned.map((e) => {
              const price = formatPrice(e.isFree, e.price, e.priceMin, e.priceMax)
              const when = `${boardClockLine(e) || 'All day'} · ${e.venueName} · ${price.value}`
              return (
                <button key={e.id} type="button" onClick={() => { onSelect?.(e.id); focus(e) }} title={e.title} className={`grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-0.5 overflow-hidden border-b border-border px-4 py-3 text-left hover:bg-muted ${focusId === e.id ? 'bg-primary/10' : ''}`}>
                  <span className="truncate font-semibold">{e.title}</span>
                  <span className="truncate text-xs text-muted-foreground">{when}</span>
                </button>
              )
            })}
            {!loading && pinned.length === 0 && <p className="px-4 py-8 text-sm text-muted-foreground">No pins match these filters.</p>}
          </div>
        </aside>
      )}
      <div className={bleed ? 'flex min-h-0 min-w-0 flex-1 flex-col' : 'relative h-full min-h-0 min-w-0'}>
      {bleed && chips ? (
        <div className="vp-map-chips flex min-w-0 shrink-0 touch-pan-x gap-1.5 overflow-x-auto overscroll-x-contain border-b border-border bg-background px-3 py-2 [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden" role="toolbar" aria-label="Map categories">
          {chips}
        </div>
      ) : null}
      <div className={bleed ? 'vp-map-stage relative min-h-0 w-full flex-1' : 'vp-map-stage relative h-full min-h-0 w-full'} style={stageStyle}>
      {loading && events.length === 0 && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/40">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}
      <div ref={mapRef} className={bleed ? 'se-map absolute inset-0 overflow-hidden' : 'se-map absolute inset-0 overflow-hidden rounded-2xl'} />
      <div className={bleed ? 'vp-map-float vp-map-count absolute left-3 top-3 z-20 max-w-[calc(100%-4.75rem)] truncate rounded-full bg-white/80 px-3 py-2 text-sm font-medium text-neutral-900 shadow-lg backdrop-blur-xl dark:bg-neutral-900/75 dark:text-white lg:hidden' : 'vp-map-float absolute left-1/2 top-4 z-20 max-w-[calc(100%-7rem)] -translate-x-1/2 truncate rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-neutral-900 shadow-lg backdrop-blur-xl dark:bg-neutral-900/75 dark:text-white sm:left-4 sm:max-w-none sm:translate-x-0'}>
        {loading && events.length === 0 ? <span>Loading map…</span> : <><span className="font-bold text-primary">{count}</span> {countNoun} on map</>}
      </div>
      {!loading && count === 0 && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-sm rounded-2xl bg-card/95 px-5 py-4 text-center text-card-foreground shadow-xl ring-1 ring-border">
            <VibePeepMascot className="mx-auto mb-2 w-20" alt="" />
            <p className="font-display text-lg font-bold">No pins from up here.</p>
            <p className="mt-1 text-sm text-muted-foreground">{searchQuery ? `Nothing matches “${searchQuery}” here. Try another city, or clear the search.` : 'Nothing with a map pin matches these filters. Try another city or loosen the filters.'}</p>
          </div>
        </div>
      )}
      {ready && (
        <button
          onClick={locate}
          disabled={loc === 'locating'}
          className={bleed ? 'vp-map-float absolute right-3 top-3 z-20 inline-flex h-11 w-11 items-center justify-center gap-2 rounded-full bg-white/90 text-sm font-semibold text-neutral-900 shadow-lg backdrop-blur-xl disabled:opacity-60 dark:bg-neutral-900/80 dark:text-white sm:w-auto sm:px-4' : 'vp-map-float absolute right-4 top-4 z-20 inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-neutral-900 shadow-lg backdrop-blur-xl hover:bg-white disabled:opacity-60 dark:bg-neutral-900/80 dark:text-white dark:hover:bg-neutral-900'}
          aria-label="Zoom to my location"
        >
          {loc === 'locating' ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <LocateFixed className="h-4 w-4 text-primary" />}
          <span className="hidden sm:inline">Near Me</span>
        </button>
      )}
      {loc === 'asking' && (
        <div className={bleed ? 'vp-map-ask absolute bottom-[calc(var(--vp-map-dock,0px)+0.75rem)] left-3 right-3 z-30 rounded-2xl bg-card p-4 text-card-foreground shadow-2xl ring-1 ring-border lg:bottom-4 lg:left-auto lg:right-16 lg:w-[340px]' : 'vp-map-ask absolute bottom-20 left-4 right-4 z-30 rounded-2xl bg-card p-4 text-card-foreground shadow-2xl ring-1 ring-border sm:bottom-4 sm:left-auto sm:right-16 sm:w-[340px]'}>
          <button onClick={declineLocation} className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
          <p className="pr-6 font-display text-lg font-bold leading-tight">Where you at?</p>
          <p className="mt-1.5 text-sm text-muted-foreground">Share your location and we'll zoom straight to the action around you.</p>
          <p className="mt-2 text-xs text-muted-foreground">We only use it in your browser to centre the map. Nothing gets saved.</p>
          <div className="mt-3 flex gap-2">
            <button onClick={locate} className="h-10 flex-1 rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90">Use My Location</button>
            <button onClick={declineLocation} className="h-10 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">Skip for Now</button>
          </div>
        </div>
      )}
      {(loc === 'denied' || loc === 'unavailable') && (
        <div className={bleed ? 'vp-map-ask absolute bottom-[calc(var(--vp-map-dock,0px)+0.75rem)] left-3 right-3 z-30 rounded-xl bg-card p-3 pr-9 text-sm shadow-xl ring-1 ring-border lg:bottom-4 lg:left-auto lg:right-16 lg:w-[340px]' : 'vp-map-ask absolute bottom-20 left-4 right-4 z-30 rounded-xl bg-card p-3 pr-9 text-sm text-card-foreground shadow-xl ring-1 ring-border sm:bottom-4 sm:left-auto sm:right-16 sm:w-[340px]'}>
          <button onClick={() => setLoc('idle')} className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
          {loc === 'denied'
            ? 'No worries. Location access is off, so we\'ll stick to the city view. You can turn it on in your browser settings any time.'
            : 'We couldn\'t pin you down just now. Give Near Me another tap in a moment.'}
        </div>
      )}
      {showCards && (
        <div ref={cardsRef} className="vp-map-cards pointer-events-none absolute inset-x-0 bottom-0 z-20 flex gap-2 overflow-x-auto bg-gradient-to-t from-background via-background/85 to-transparent px-3 pb-3 pt-4 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
          {pinned.slice(0, 12).map((e) => {
            const price = formatPrice(e.isFree, e.price, e.priceMin, e.priceMax)
            return (
              <button key={e.id} type="button" onClick={() => { onSelect?.(e.id); focus(e) }} title={e.title} className={`pointer-events-auto w-44 shrink-0 rounded-xl border bg-card p-3 text-left shadow-lg ${focusId === e.id ? 'border-primary' : 'border-border'}`}>
                <span className="block truncate text-sm font-semibold">{e.title}</span>
                <span className="vp-map-card-venue block truncate text-xs text-muted-foreground">{e.venueName}</span>
                <span className="mt-1 block truncate font-mono text-xs">{price.value}</span>
              </button>
            )
          })}
        </div>
      )}
      </div>
      </div>
      </div>
    </div>
  )
}
