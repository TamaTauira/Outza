'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { Loader2, MapPinOff } from 'lucide-react'
import { createBasemap } from '@/lib/map-basemap'
import { EVENT_PIN_ANCHOR, EVENT_PIN_SIZE, eventPinHtml, MAP_ATTRIBUTION, MAP_MAX_ZOOM } from '@/lib/map-style'
import { loadLeaflet } from '@/lib/load-leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

type Geo = { lat: number; lng: number }

/** Small single-venue map. Same basemap as the Map page, with the branded event pin. */
export function VenueMap({ lat, lng, query, city, color = '#FF7A1A', letter = '•', label }: {
  lat?: number | null; lng?: number | null; query?: string; city?: string | null; color?: string; letter?: string; label?: string
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const tileRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const Lref = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [geo, setGeo] = useState<Geo | null>(lat != null && lng != null ? { lat, lng } : null)
  const [failed, setFailed] = useState(false)
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme !== 'light'

  // No stored coordinates: look the address up (same geocoder as the itinerary)
  useEffect(() => {
    if (lat != null && lng != null) { setGeo({ lat, lng }); return }
    if (!query) { setFailed(true); return }
    let cancelled = false
    fetch('/api/itinerary/locate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stops: [{ id: 'custom-venue', query, city }] }) })
      .then((r) => r.json())
      .then((d) => { if (cancelled) return; const g = d?.locations?.['custom-venue']; if (g) setGeo(g); else setFailed(true) })
      .catch((err) => { console.error('Venue map geocode failed:', err); if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [lat, lng, query, city])

  useEffect(() => {
    if (!geo) return
    let cancelled = false
    ;(async () => {
      try {
        const Leaflet = await loadLeaflet()
        if (cancelled || !elRef.current || mapRef.current) return
        Lref.current = Leaflet
        const map = Leaflet.map(elRef.current, { zoomControl: false, scrollWheelZoom: false, maxZoom: MAP_MAX_ZOOM }).setView([geo.lat, geo.lng], 16)
        Leaflet.control.zoom({ position: 'bottomright' }).addTo(map)
        map.attributionControl?.addAttribution(MAP_ATTRIBUTION)
        mapRef.current = map
        setReady(true)
      } catch (err) {
        console.error('Map failed to load:', err)
        if (!cancelled) setFailed(true)
      }
    })()
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; setReady(false) } }
  }, [geo])

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
        console.error('Map style failed to load:', err)
      }
    })()
    return () => { cancelled = true }
  }, [ready, dark])

  useEffect(() => {
    const map = mapRef.current
    const L = Lref.current
    if (!ready || !map || !geo || !L) return
    if (markerRef.current) map.removeLayer(markerRef.current)
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
    markerRef.current = L.marker([geo.lat, geo.lng], {
      icon: L.divIcon({ className: 'se-pin-wrap', html: eventPinHtml(color, esc(letter)), iconSize: EVENT_PIN_SIZE, iconAnchor: EVENT_PIN_ANCHOR }),
      keyboard: false,
    }).addTo(map)
    if (label) markerRef.current.bindTooltip(label)
  }, [ready, geo, color, letter, label])

  if (failed && !geo) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <MapPinOff className="w-6 h-6" />Couldn&apos;t pin this one on the map. Use the address below.
      </div>
    )
  }
  return (
    <>
      {!ready && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}
      <div ref={elRef} className="se-map absolute inset-0" aria-label={label ? `Map of ${label}` : 'Map'} />
    </>
  )
}
