'use client'

import { useEffect, useMemo, useRef, useState, useCallback, type CSSProperties, type ReactNode } from 'react'
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
import { destroyLeafletMap, detachBasemap, mapIsLive } from '@/lib/leaflet-map'
import { MAP_ATTRIBUTION, MAP_MAX_ZOOM } from '@/lib/map-style'
import { loadLeaflet } from '@/lib/load-leaflet'
import { DEFAULT_NEAR_ME_RADIUS_KM, NEAR_ME_RADII_KM, areaJumpTarget, filterPinsWithinRadius, locateStateAfterError, locateStateAfterInvalidation, shouldAutoLocate, type LocateState } from '@/lib/map-near-me'
import { isPaidListing } from '@/lib/quality'
import { armReconnect, createReconnectRetry, readJson } from '@/lib/client-fetch'
import { isBareNetworkFault } from '@/lib/network-fault'
import { ReachBeacon } from '@/components/reach-beacon'
import { VibePeepMascot } from '@/components/vibepeep-mascot'
import { eventPictureSrc, type PlaceholderSlot } from '@/lib/placeholders'
import { variantUrl, type ClientImage, type VariantKind } from '@/lib/images/spec'
import { displaySourceUrl } from '@/lib/images/source-url-client'
import { declaredPhotoIsLowQuality, storedPhotoIsLowQuality } from '@/lib/images/listing-photo'
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

function pictureSrc(e: { imageUrl?: string | null; imageAsset?: ClientImage | null; category?: string | null; imageWidth?: number | null; imageHeight?: number | null }, slot: PlaceholderSlot) {
  if (declaredPhotoIsLowQuality(e.imageUrl) || storedPhotoIsLowQuality(e.imageWidth, e.imageHeight)) return eventPictureSrc(null, e.category, slot)
  const kind: VariantKind = slot === 'marker' || slot === 'square' ? 'square' : 'card'
  const m = e.imageAsset?.variants
  const widths = m?.sizes?.[kind]
  if (m && widths?.length) return variantUrl(m, kind, slot === 'marker' ? widths[0] : widths[widths.length - 1], 'webp')
  const sized = displaySourceUrl(e.imageUrl, slot === 'marker' ? 96 : slot === 'popup' ? 480 : 640)
  return sized || eventPictureSrc(e.imageUrl, e.category, slot)
}

function holdingPicture(e: { imageUrl?: string | null; imageAsset?: ClientImage | null; imageWidth?: number | null; imageHeight?: number | null }, slot: PlaceholderSlot) {
  const kind: VariantKind = slot === 'marker' || slot === 'square' ? 'square' : 'card'
  const widths = e.imageAsset?.variants?.sizes?.[kind]
  if (declaredPhotoIsLowQuality(e.imageUrl) || storedPhotoIsLowQuality(e.imageWidth, e.imageHeight)) return true
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

function markerIcon(L: any, e: { category?: string | null }, color: string, tier?: string) {
  const size = tier === 'GOLD' ? 28 : 18
  const ring = tier === 'GOLD' ? '#F5B700' : '#fff'
  const mark = tier === 'GOLD' ? '★' : (e.category || '?').trim().charAt(0).toUpperCase() || '?'
  return L.divIcon({
    className: 'se-marker-wrap',
    html: `<div class="se-marker ${tier ? `se-marker-${tier.toLowerCase()}` : ''}" style="width:${size}px;height:${size}px;background-color:${color};border-color:${ring}">${esc(mark)}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

const LOC_KEY = 'outza-location-v1' // 'granted' | 'declined' (consent only, coordinates are never stored)
type LocState = LocateState

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
  const [offline, setOffline] = useState(false)
  const [ready, setReady] = useState(false)
  const [basemapReady, setBasemapReady] = useState(false)
  const youRef = useRef<any>(null)
  const Lref = useRef<any>(null)
  const fetchSeq = useRef(0)
  // Incremented whenever a locate starts and whenever the visitor jumps
  // elsewhere (city change, area selection): a geolocation answer that
  // arrives after either is stale and must not re-centre the map or switch
  // Near me back on over the new city/area. The jumps settle the locate
  // state themselves (locateStateAfterInvalidation), so a stale callback
  // can simply drop its answer — 'locating' never outlives the locate
  // that set it.
  const locateGenRef = useRef(0)
  const [loc, setLoc] = useState<LocState>('idle')
  // The visitor's own position and the Near me radius. Session-only state:
  // coordinates are never persisted or sent anywhere (see lib/map-near-me).
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null)
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_NEAR_ME_RADIUS_KM)
  const nearMe = loc === 'found' && !!userPos
  const cardsRef = useRef<HTMLDivElement>(null)
  const [dock, setDock] = useState(0)
  const [box, setBox] = useState<{ south: number; north: number; west: number; east: number } | null>(null)
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
      // Near me filters by distance instead of suburb, so while it is on the
      // suburb clause stays out of the map's fetch. The shared filter state
      // is untouched — selecting an area turns Near me off (below).
      if (filters.suburb && !nearMe) params.set('suburb', filters.suburb)
      if (filters.isFree) params.set('isFree', 'true')
      if (filters.isLGBTI) params.set('isLGBTI', 'true')
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
      if (filters.dateTo) params.set('dateTo', filters.dateTo)
      const [eventsResult, featuredResult] = await Promise.all([
        readJson<{ events?: { price?: string | null; priceMin?: number | null }[] }>(`/api/events?${params.toString()}`),
        readJson<{ items?: unknown[] }>(`/api/featured${city ? `?city=${encodeURIComponent(city)}` : ''}`),
      ])
      if (seq !== fetchSeq.current) return
      if ((!eventsResult.ok && eventsResult.reason === 'abort') || (!featuredResult.ok && featuredResult.reason === 'abort')) return
      if ((!eventsResult.ok && eventsResult.reason === 'network') || (!featuredResult.ok && featuredResult.reason === 'network')) {
        setOffline(true)
        return
      }
      if (!eventsResult.ok) {
        console.error('Failed to fetch events for map:', eventsResult.status)
        return
      }
      const list = (eventsResult.data.events ?? []).filter((ev) => !filters.isFree || !isPaidListing(ev))
      setEvents(list)
      if (featuredResult.ok) setFeatured(featuredResult.data.items ?? [])
      setOffline(false)
    } catch (err) {
      if (!isBareNetworkFault(err)) console.error('Failed to fetch events for map:', err)
      else setOffline(true)
    } finally {
      if (seq === fetchSeq.current) setLoading(false)
    }
  }, [searchQuery, city, categoryKey, filters.subTag, filters.suburb, filters.isFree, filters.isLGBTI, filters.dateFrom, filters.dateTo, nearMe])

  useEffect(() => { if (!locked) fetchEvents() }, [fetchEvents, locked])

  useEffect(() => {
    if (!offline || locked) return
    const retry = createReconnectRetry()
    armReconnect(retry, () => { void fetchEvents() })
    return () => retry.stop()
  }, [offline, locked, fetchEvents])

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
      destroyLeafletMap(mapInstanceRef.current)
      mapInstanceRef.current = null
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
        if (cancelled || !mapIsLive(map)) return
        if (tileRef.current) map.removeLayer(tileRef.current)
        tileRef.current = layer.addTo(map)
        const paint = () => { if (!cancelled) setBasemapReady(true) }
        window.setTimeout(paint, 2500)
        try {
          if (typeof layer.once === 'function') layer.once('load', paint)
          else if (typeof layer.on === 'function') layer.on('load', paint)
        } catch { /* the timeout still clears the loader */ }
      } catch (err) {
        if (!isBareNetworkFault(err)) console.error('Map style failed to load:', err)
      }
    })()
    return () => {
      cancelled = true
      detachBasemap(mapInstanceRef.current, tileRef.current)
      tileRef.current = null
    }
  }, [ready, dark])

  // Re-centre when the city changes
  const centredCityRef = useRef(city)
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!ready || !map) return
    if (locked) return
    // Picking another city is a jump elsewhere: Near me and its distance
    // filter belong to the place the visitor was standing in, so a real
    // city change turns them off. (The first run after the map is ready is
    // not a change — an auto-locate already in flight must survive it.)
    if (centredCityRef.current !== city) {
      centredCityRef.current = city
      locateGenRef.current++
      setUserPos(null)
      setLoc((cur) => locateStateAfterInvalidation(cur))
    }
    if (city) { const c = cityDef(city); map.setView([c.lat, c.lng], 12) }
    else map.setView([-27.5, 134], 4)
  }, [ready, city, locked])

  // Selecting an area is a jump elsewhere too: it turns Near me off (the
  // suburb clause the board already applies takes over from the distance
  // filter) and, when the value names one of the board's area groups, pans
  // to that group's centre. A plain suburb has no stored centre; its pins
  // are already the only ones fetched, so the view stays put.
  const suburbRef = useRef(filters.suburb)
  useEffect(() => {
    const prev = suburbRef.current
    suburbRef.current = filters.suburb
    if (!filters.suburb || filters.suburb === prev) return
    locateGenRef.current++
    setUserPos(null)
    setLoc((cur) => locateStateAfterInvalidation(cur))
    const map = mapInstanceRef.current
    if (!ready || !map || locked) return
    const target = areaJumpTarget(city, filters.suburb)
    if (target) map.setView([target.lat, target.lng], 12)
  }, [filters.suburb, ready, city, locked])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!ready || !map) return
    const read = () => {
      if (!mapIsLive(map) || typeof map.getBounds !== 'function') return
      const bounds = map.getBounds()
      setBox({ south: bounds.getSouth(), north: bounds.getNorth(), west: bounds.getWest(), east: bounds.getEast() })
    }
    read()
    map.on('moveend', read)
    return () => map.off('moveend', read)
  }, [ready, city])

  // Zoom to the visitor's own location (only after they've opted in; used in the browser only).
  // The mount auto-locate passes { silent: true }: it runs unprompted, so an
  // error settles back to 'idle' instead of owning a card the visitor never
  // asked for (locateStateAfterError). A tap keeps the honest outcome.
  const locate = useCallback((opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setLoc(locateStateAfterError({ permissionDenied: false, silent })); return }
    const gen = ++locateGenRef.current
    setLoc('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (gen !== locateGenRef.current) return
        // Settle the locate state before the map work: the returns below
        // (no map instance, Leaflet not in hand) must not strand the
        // button in 'locating'. The browser answered and the position is
        // held, so the locate is 'found' whatever happens to the marker.
        try { localStorage.setItem(LOC_KEY, 'granted') } catch {}
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLoc('found')
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
      },
      (err) => {
        // Logged before the generation guard, so a refusal stays capturable
        // even when a jump has already superseded this locate: the code and
        // message are the only way to see why the browser refused.
        console.error('[near-me] geolocation error', err.code, err.message)
        if (gen !== locateGenRef.current) return
        setUserPos(null)
        const denied = err.code === err.PERMISSION_DENIED
        // Only a tapped denial is recorded as consent: a silent
        // (unprompted) refusal persists nothing, so a transient browser
        // 'no' during the mount check is never stored as the visitor
        // having declined.
        if (denied && !silent) { try { localStorage.setItem(LOC_KEY, 'declined') } catch {} }
        setLoc(locateStateAfterError({ permissionDenied: denied, silent }))
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }, [])

  // The "You are here" dot belongs to Near me: whenever the held position
  // is dropped — an area/suburb jump, a city change, a failed re-locate —
  // the marker goes too, so the map never keeps showing the visitor's dot
  // while the distance filter is off.
  useEffect(() => {
    if (userPos) return
    const map = mapInstanceRef.current
    if (map && youRef.current) {
      map.removeLayer(youRef.current)
      youRef.current = null
    }
  }, [userPos])

  // On mount, centre on the visitor when location is already granted — the
  // Permissions API where it can be read, else the stored consent from a
  // previous Near Me success (see shouldAutoLocate). Otherwise the map opens
  // on the board's selected area as usual and the Near Me button offers to
  // enable location; the map never waits on a permission answer to render,
  // and no in-app prompt pops up on its own.
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    ;(async () => {
      let stored: string | null = null
      try { stored = localStorage.getItem(LOC_KEY) } catch {}
      let permission: 'granted' | 'denied' | 'prompt' | null = null
      try {
        const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName })
        if (status) permission = status.state
      } catch { /* the Permissions API cannot answer here; the stored consent decides */ }
      if (cancelled) return
      if (shouldAutoLocate({ storedConsent: stored, permission })) locate({ silent: true })
    })()
    return () => { cancelled = true }
  }, [ready, locate])

  // Re-centre on the visitor's own position (the Near Me button while Near
  // me is on). Uses the position already held — no fresh permission request.
  const recentre = useCallback(() => {
    const map = mapInstanceRef.current
    if (!map || !userPos) return
    const zoom = typeof map.getZoom === 'function' ? map.getZoom() : 14
    map.setView([userPos.lat, userPos.lng], Math.max(zoom, 14))
  }, [userPos])

  // Picking a radius also frames it, so the visitor sees the area the
  // distance filter now covers.
  const chooseRadius = useCallback((r: number) => {
    setRadiusKm(r)
    const map = mapInstanceRef.current
    const L = Lref.current
    if (!map || !L || !userPos) return
    const bounds = L.latLng(userPos.lat, userPos.lng).toBounds(r * 2000)
    if (bounds?.isValid?.()) map.fitBounds(bounds, { maxZoom: 15 })
  }, [userPos])

  // While Near me is on, the pins are the fetched set cut to the chosen
  // radius around the visitor (nearest first) — distance replaces the
  // suburb filter. Off, the fetched set is shown as before.
  const displayEvents = useMemo(
    () => (nearMe && userPos ? filterPinsWithinRadius(events, userPos, radiusKm) : events),
    [events, nearMe, userPos, radiusKm],
  )

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
      const color = tier === 'GOLD' ? '#F5B700' : (CATEGORIES.find((c) => c.name === e?.category)?.color ?? '#FF7A35')
      const m = L.marker([e.latitude, e.longitude], {
        icon: markerIcon(L, e, color, tier),
        title: e?.title,
        zIndexOffset: tier === 'GOLD' ? 1000 : tier === 'BRONZE' ? 500 : 0,
      }).bindPopup(popupHtml(e, tier), { className: 'se-popup', maxWidth: 280 })
      m.on('click', () => onSelectRef.current?.(e.id))
      markerById.current.set(e.id, m)
      mcg.addLayer(m)
    }

    for (const e of displayEvents) {
      const tier = e.promoTier ?? tierById.get(e.id)
      if (tier === 'GOLD' && !locked) continue
      addMarker(e, tier)
    }
    // GOLD featured pins arrive as their own set, but the Near me radius is
    // a promise about every pin on the map: while Near me is on they go
    // through the same distance cut as the fetched events (they carry the
    // same latitude/longitude shape). Off, they show exactly as before.
    const goldFeatured = featured.filter((f: any) => f.tier === 'GOLD')
    const shownGold = nearMe && userPos ? filterPinsWithinRadius(goldFeatured, userPos, radiusKm) : goldFeatured
    for (const f of shownGold) addMarker(f, 'GOLD')
    map.addLayer(mcg)
    markersRef.current = mcg
    goldRef.current = null
    if (locked && typeof mcg.getBounds === 'function') {
      const bounds = mcg.getBounds()
      if (bounds?.isValid?.()) map.fitBounds(bounds.pad(0.25), { maxZoom: 14, animate: false })
    }
  }, [displayEvents, featured, ready, locked, nearMe, userPos, radiusKm])

  const inView = (e: any) => {
    if (e?.latitude == null || e?.longitude == null) return false
    if (!box) return true
    return e.latitude >= box.south && e.latitude <= box.north && e.longitude >= box.west && e.longitude <= box.east
  }
  const visiblePins = displayEvents.filter(inView)
  const count = visiblePins.length
  const pinned = visiblePins.slice(0, 40)
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
            <p className="text-xs text-muted-foreground">{loading ? 'Loading pins…' : `${count} ${countNoun} in view`}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {pinned.map((e) => {
              const price = formatPrice(e.isFree, e.price, e.priceMin, e.priceMax)
              const when = `${boardClockLine(e) || 'All day'} · ${e.venueName} · ${[price.prefix, price.value].filter(Boolean).join(' ')}`
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
        <div className="vp-map-chips flex min-w-0 shrink-0 touch-pan-x items-center gap-1.5 overflow-x-auto overscroll-x-contain border-b border-border bg-background px-3 py-2 [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden" role="toolbar" aria-label="When and what">
          {chips}
        </div>
      ) : null}
      <div className={bleed ? 'vp-map-stage relative min-h-0 w-full flex-1' : 'vp-map-stage relative h-full min-h-0 w-full'} style={stageStyle}>
      {!basemapReady && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#151a19] text-[#f5f5f2]" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-semibold">Pulling the map into place…</p>
        </div>
      )}
      <div ref={mapRef} className={bleed ? 'se-map absolute inset-0 overflow-hidden' : 'se-map absolute inset-0 overflow-hidden rounded-2xl'} />
      <div className={bleed ? 'vp-map-float vp-map-count absolute left-3 top-3 z-20 max-w-[calc(100%-4.75rem)] truncate rounded-full bg-white/80 px-3 py-2 text-sm font-medium text-neutral-900 shadow-lg backdrop-blur-xl dark:bg-neutral-900/75 dark:text-white lg:hidden' : 'vp-map-float absolute left-1/2 top-4 z-20 max-w-[calc(100%-7rem)] -translate-x-1/2 truncate rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-neutral-900 shadow-lg backdrop-blur-xl dark:bg-neutral-900/75 dark:text-white sm:left-4 sm:max-w-none sm:translate-x-0'}>
        {loading && events.length === 0 ? <span>Loading map…</span> : <><span className="font-bold text-primary">{count}</span> {countNoun} on map{offline ? ' · last loaded' : ''}</>}
      </div>
      {!loading && offline && count === 0 && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-sm rounded-2xl bg-card/95 px-5 py-4 text-center text-card-foreground shadow-xl ring-1 ring-border" role="status">
            <p className="font-display text-lg font-bold">The signal dropped.</p>
            <p className="mt-1 text-sm text-muted-foreground">The map is fine. We just couldn&apos;t load the pins.</p>
            <button type="button" onClick={() => { void fetchEvents() }} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Try again</button>
          </div>
        </div>
      )}
      {!loading && !offline && count === 0 && (
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
          onClick={nearMe ? recentre : () => locate()}
          disabled={loc === 'locating'}
          aria-pressed={nearMe}
          className={(bleed ? 'vp-map-float absolute right-4 top-4 z-20 inline-flex h-11 w-11 items-center justify-center gap-2 rounded-full bg-white/90 text-sm font-semibold text-neutral-900 shadow-lg backdrop-blur-xl disabled:opacity-60 dark:bg-neutral-900/80 dark:text-white sm:w-auto sm:px-4' : 'vp-map-float absolute right-4 top-4 z-20 inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-neutral-900 shadow-lg backdrop-blur-xl hover:bg-white disabled:opacity-60 dark:bg-neutral-900/80 dark:text-white dark:hover:bg-neutral-900') + (nearMe ? ' ring-2 ring-primary' : '')}
          aria-label={nearMe ? 'Re-centre on my location' : 'Zoom to my location'}
        >
          {loc === 'locating' ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <LocateFixed className="h-4 w-4 text-primary" />}
          <span className="hidden sm:inline">Near Me</span>
        </button>
      )}
      {ready && nearMe && (
        <div className="vp-map-float absolute right-4 top-[4.25rem] z-20 flex items-center gap-1 rounded-full bg-white/90 p-1 text-neutral-900 shadow-lg backdrop-blur-xl dark:bg-neutral-900/80 dark:text-white" role="group" aria-label="Near me distance">
          <span className="pl-2 pr-1 text-xs font-semibold">Near me</span>
          {NEAR_ME_RADII_KM.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={radiusKm === r}
              onClick={() => chooseRadius(r)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${radiusKm === r ? 'bg-primary text-primary-foreground' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}
            >
              {r} km
            </button>
          ))}
        </div>
      )}
      {(loc === 'denied' || loc === 'unavailable') && (
        <div className={bleed ? 'vp-map-ask absolute bottom-[calc(var(--vp-map-dock,0px)+3.4rem)] left-3 right-3 z-30 rounded-xl bg-card p-3 pr-9 text-sm shadow-xl ring-1 ring-border lg:bottom-4 lg:left-auto lg:right-16 lg:w-[340px]' : 'vp-map-ask absolute bottom-24 left-4 right-4 z-30 rounded-xl bg-card p-3 pr-9 text-sm text-card-foreground shadow-xl ring-1 ring-border sm:bottom-4 sm:left-auto sm:right-16 sm:w-[340px]'}>
          <button onClick={() => setLoc('idle')} className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
          {loc === 'denied'
            ? 'No worries. Location access is off, so we\'ll stick to the city view. You can turn it on in your browser settings any time.'
            : 'We couldn\'t pin you down just now. Give Near Me another tap in a moment.'}
        </div>
      )}
      <p className="vp-map-credit" dangerouslySetInnerHTML={{ __html: MAP_ATTRIBUTION }} />
      {showCards && (
        <div ref={cardsRef} className="vp-map-cards pointer-events-none absolute inset-x-0 bottom-0 z-20 flex gap-2 overflow-x-auto bg-gradient-to-t from-background via-background/85 to-transparent px-3 pb-3 pt-4 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
          {pinned.slice(0, 12).map((e) => {
            const price = formatPrice(e.isFree, e.price, e.priceMin, e.priceMax)
            return (
              <button key={e.id} type="button" onClick={() => { onSelect?.(e.id); focus(e) }} title={e.title} className={`pointer-events-auto w-44 shrink-0 rounded-xl border bg-card p-3 text-left shadow-lg ${focusId === e.id ? 'border-primary' : 'border-border'}`}>
                <span className="block truncate text-sm font-semibold">{e.title}</span>
                <span className="vp-map-card-venue block truncate text-xs text-muted-foreground">{e.venueName}</span>
                <span className="mt-1 block truncate font-mono text-xs">{[price.prefix, price.value].filter(Boolean).join(' ')}</span>
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
