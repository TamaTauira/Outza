'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { Loader2, Maximize2, Minimize2 } from 'lucide-react'
import { cityDef, CITY_NAMES } from '@/lib/cities'
import { createBasemap } from '@/lib/map-basemap'
import { EVENT_PIN_ANCHOR, EVENT_PIN_SIZE, eventPinHtml, MAP_ATTRIBUTION, MAP_MAX_ZOOM } from '@/lib/map-style'
import { loadLeaflet } from '@/lib/load-leaflet'
import { cn } from '@/lib/utils'
import 'leaflet/dist/leaflet.css'

export interface LocalMapPin {
  key: string
  title: string
  suburb: string
  lat: number
  lng: number
}

interface Props {
  pins: LocalMapPin[]
  city: string
  hotKey: string | null
  focusKey: string | null
  onHot: (key: string | null) => void
  onFocus: (key: string) => void
  onCity: (city: string) => void
  loading?: boolean
  className?: string
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

/** Nudge stacked pins apart so a suburb with several listings is not one dot. */
function spread(pins: LocalMapPin[]): LocalMapPin[] {
  const groups = new Map<string, LocalMapPin[]>()
  for (const pin of pins) {
    const bucket = `${pin.lat.toFixed(4)}|${pin.lng.toFixed(4)}`
    groups.set(bucket, [...(groups.get(bucket) ?? []), pin])
  }
  const out: LocalMapPin[] = []
  for (const group of groups.values()) {
    group.forEach((pin, index) => {
      if (group.length === 1) {
        out.push(pin)
        return
      }
      const angle = (index / group.length) * Math.PI * 2
      const radius = 0.0016
      out.push({
        ...pin,
        lat: pin.lat + Math.sin(angle) * radius,
        lng: pin.lng + (Math.cos(angle) * radius) / Math.max(0.2, Math.cos((pin.lat * Math.PI) / 180)),
      })
    })
  }
  return out
}

export function LocalNeighbourhoodMap({ pins, city, hotKey, focusKey, onHot, onFocus, onCity, loading = false, className }: Props) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const tileRef = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map())
  const Lref = useRef<any>(null)
  const onHotRef = useRef(onHot)
  const onFocusRef = useRef(onFocus)
  const cityRef = useRef(city)
  const focusSeen = useRef<string | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === 'dark'

  useEffect(() => { cityRef.current = city }, [city])
  useEffect(() => { onHotRef.current = onHot }, [onHot])
  useEffect(() => { onFocusRef.current = onFocus }, [onFocus])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const Leaflet = await loadLeaflet()
        if (cancelled || !elRef.current || mapRef.current) return
        Lref.current = Leaflet
        const here = cityDef(cityRef.current)
        const map = Leaflet.map(elRef.current, { zoomControl: false, scrollWheelZoom: false, maxZoom: MAP_MAX_ZOOM }).setView([here.lat, here.lng], 12)
        Leaflet.control.zoom({ position: 'bottomright' }).addTo(map)
        map.attributionControl?.setPrefix('')
        map.attributionControl?.addAttribution(MAP_ATTRIBUTION)
        mapRef.current = map
        setReady(true)
      } catch (err) {
        console.error('Local map failed to load:', err)
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      markersRef.current = new Map()
      setReady(false)
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
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
        console.error('Local map style failed:', err)
      }
    })()
    return () => { cancelled = true }
  }, [ready, dark])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (expanded) map.scrollWheelZoom.enable()
    else map.scrollWheelZoom.disable()
    const id = requestAnimationFrame(() => map.invalidateSize())
    return () => cancelAnimationFrame(id)
  }, [expanded, ready, className, pins.length])

  useEffect(() => {
    const map = mapRef.current
    const L = Lref.current
    if (!ready || !map || !L) return
    markersRef.current.forEach((marker) => map.removeLayer(marker))
    markersRef.current.clear()
    const placed = spread(pins.filter((pin) => Number.isFinite(pin.lat) && Number.isFinite(pin.lng)))
    for (const pin of placed) {
      const marker = L.marker([pin.lat, pin.lng], {
        icon: L.divIcon({
          className: 'se-pin-wrap vp-local-pin',
          html: eventPinHtml('#FF7A1A'),
          iconSize: EVENT_PIN_SIZE,
          iconAnchor: EVENT_PIN_ANCHOR,
        }),
        title: pin.title,
        keyboard: true,
        zIndexOffset: 0,
      })
      marker.bindTooltip(`<strong>${esc(pin.title)}</strong><br/>${esc(pin.suburb)}`, { direction: 'top', offset: [0, -40], opacity: 0.96 })
      marker.on('mouseover', () => onHotRef.current(pin.key))
      marker.on('mouseout', () => onHotRef.current(null))
      marker.on('click', () => {
        onHotRef.current(pin.key)
        onFocusRef.current(pin.key)
      })
      marker.addTo(map)
      markersRef.current.set(pin.key, marker)
    }
    if (placed.length) {
      const bounds = L.latLngBounds(placed.map((pin) => [pin.lat, pin.lng]))
      map.fitBounds(bounds.pad(0.25), { maxZoom: 13, animate: false })
    } else {
      const here = cityDef(city)
      map.setView([here.lat, here.lng], 12)
    }
  }, [ready, pins, city])

  useEffect(() => {
    markersRef.current.forEach((marker, key) => {
      const el = marker.getElement?.() as HTMLElement | null
      const on = key === hotKey || key === focusKey
      el?.classList.toggle('is-hot', on)
      marker.setZIndexOffset(on ? 800 : 0)
      if (key === hotKey) marker.openTooltip()
      else marker.closeTooltip()
    })
    if (!focusKey || focusKey === focusSeen.current) return
    focusSeen.current = focusKey
    const marker = markersRef.current.get(focusKey)
    const map = mapRef.current
    if (marker && map) map.panTo(marker.getLatLng(), { animate: true })
  }, [hotKey, focusKey, pins, ready])

  return (
    <>
      {expanded && <button type="button" aria-label="Close the map" className="fixed inset-0 z-30 bg-black/40" onClick={() => setExpanded(false)} />}
      <div className={cn('overflow-hidden rounded-2xl border border-border bg-[#e7e2d8] dark:bg-card', expanded ? 'fixed z-40 left-3 right-3 top-[4.5rem] bottom-[calc(var(--vp-bottom-nav-offset,0px)+0.75rem)] shadow-2xl' : cn('relative', className))}>
        <div ref={elRef} className="se-map vp-local-map absolute inset-0" role="application" aria-label={`Map of ${city} and nearby`} />
        {!ready && !failed && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
        {failed && <p className="absolute inset-x-6 top-16 rounded-2xl bg-card/95 px-4 py-3 text-center text-sm">The map is taking a breather. The list still has everything.</p>}
        {ready && pins.length === 0 && !failed && !loading && (
          <p className="pointer-events-none absolute inset-x-6 top-14 z-[500] rounded-2xl bg-card/92 px-4 py-3 text-center text-sm shadow-sm">No pins for this filter yet. The list still has the goods.</p>
        )}
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-label={expanded ? 'Shrink the map' : 'Expand the map'}
          className="absolute right-3 top-3 z-[500] grid h-11 w-11 place-items-center rounded-full bg-white/95 text-neutral-900 shadow-md backdrop-blur dark:bg-neutral-900/90 dark:text-white"
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <label className="absolute bottom-9 left-3 z-[500]">
          <span className="sr-only">Area</span>
          <select
            value={CITY_NAMES.includes(city) ? city : CITY_NAMES[0]}
            onChange={(e) => onCity(e.target.value)}
            aria-label="Area"
            className="h-11 max-w-[14rem] rounded-full border border-black/5 bg-white/95 pl-3 pr-8 text-sm font-medium text-neutral-900 shadow-md backdrop-blur dark:border-white/10 dark:bg-neutral-900/90 dark:text-white"
          >
            {CITY_NAMES.map((name) => <option key={name} value={name}>{name} and nearby</option>)}
          </select>
        </label>
      </div>
    </>
  )
}
