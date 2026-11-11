'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { loadLeaflet } from '@/lib/load-leaflet'
import { createBasemap } from '@/lib/map-basemap'
import { MAP_ATTRIBUTION, MAP_MAX_ZOOM } from '@/lib/map-style'
import { coordsFitCity, fmtMin, planLeg } from '@/lib/travel'
import { eventPath } from '@/lib/seo'
import type { ItineraryItem } from '@/lib/itinerary'
import 'leaflet/dist/leaflet.css'

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

const pinOk = (stop: ItineraryItem) => stop.lat != null && stop.lng != null && coordsFitCity(stop.lat, stop.lng, stop.city)

function popupHtml(stop: ItineraryItem, number: number) {
  const where = [stop.venueName, stop.place].filter(Boolean).join(' · ')
  const href = stop.kind === 'event' ? (stop.href ?? eventPath(stop)) : ''
  const img = stop.imageUrl && /^https?:\/\//i.test(stop.imageUrl)
    ? `<img src="${esc(stop.imageUrl)}" alt="" style="width:100%;height:96px;object-fit:cover;border-radius:10px;margin-bottom:8px" />`
    : ''
  return `<div style="min-width:180px;font-family:inherit">${img}<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.7">Stop ${number}${stop.kind === 'custom' ? ' · Your stop' : ''}</div><div style="font-weight:700;margin-top:2px">${esc(stop.title)}</div><div style="font-size:12px;margin-top:4px;opacity:.8">${esc(stop.time ?? 'Time not set')}${where ? `<br/>${esc(where)}` : ''}</div>${href ? `<div style="margin-top:6px"><a href="${esc(href)}">Details →</a></div>` : ''}</div>`
}

/** Numbered itinerary pins and a route that only joins stops we can actually place. */
export function ItineraryMap({
  stops,
  activeId,
  onSelect,
}: {
  stops: ItineraryItem[]
  activeId: string | null
  onSelect: (id: string) => void
}) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const layerRef = useRef<any>(null)
  const tileRef = useRef<any>(null)
  const markers = useRef<Map<string, any>>(new Map())
  const Lref = useRef<any>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const [ready, setReady] = useState(false)
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme !== 'light'
  const signature = stops.map((stop) => `${stop.id}:${stop.order ?? ''}:${stop.lat ?? ''}:${stop.lng ?? ''}`).join('|')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const Leaflet = await loadLeaflet()
      if (cancelled || !mapRef.current || mapInstance.current) return
      Lref.current = Leaflet
      const map = Leaflet.map(mapRef.current, { zoomControl: false, maxZoom: MAP_MAX_ZOOM }).setView([-33.8688, 151.2093], 12)
      Leaflet.control.zoom({ position: 'bottomright' }).addTo(map)
      map.attributionControl?.addAttribution(MAP_ATTRIBUTION)
      mapInstance.current = map
      setReady(true)
    })()
    return () => {
      cancelled = true
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null }
      setReady(false)
    }
  }, [])

  useEffect(() => {
    const map = mapInstance.current
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
        console.error('Itinerary map style failed:', err)
      }
    })()
    return () => { cancelled = true }
  }, [ready, dark])

  useEffect(() => {
    const map = mapInstance.current
    const L = Lref.current
    if (!ready || !map || !L) return
    if (layerRef.current) map.removeLayer(layerRef.current)
    const group = L.layerGroup()
    markers.current = new Map()
    const points: [number, number][] = []
    let previous: ItineraryItem | null = null
    stops.forEach((stop, index) => {
      const number = index + 1
      if (!pinOk(stop)) { previous = null; return }
      const at: [number, number] = [stop.lat as number, stop.lng as number]
      points.push(at)
      if (previous && pinOk(previous)) {
        const planned = planLeg(previous, stop)
        if (planned.kind === 'trip') {
          const line = L.polyline([[previous.lat, previous.lng], at], { color: '#FF5A3C', weight: 4, opacity: 0.9 })
          line.bindTooltip(`≈ ${fmtMin(planned.leg.recommendedMin)} · ${planned.leg.mode === 'walking' ? 'walk' : 'drive'}`, { sticky: true })
          group.addLayer(line)
        }
      }
      const custom = stop.kind === 'custom'
      const icon = L.divIcon({
        className: 'se-marker-wrap',
        html: `<div style="width:32px;height:32px;border-radius:${custom ? '8px' : '999px'};background:${custom ? '#1c1c1e' : '#FF5A3C'};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;border:2px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.25)">${number}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      })
      const marker = L.marker(at, { icon, title: stop.title, zIndexOffset: 400 }).bindPopup(popupHtml(stop, number), { maxWidth: 260 })
      marker.on('click', () => onSelectRef.current(stop.id))
      markers.current.set(stop.id, marker)
      group.addLayer(marker)
      previous = stop
    })
    group.addTo(map)
    layerRef.current = group
    if (points.length) map.fitBounds(L.latLngBounds(points).pad(0.3), { maxZoom: 15, animate: false })
    requestAnimationFrame(() => map.invalidateSize())
  }, [ready, signature, stops])

  useEffect(() => {
    if (!ready || !activeId) return
    const map = mapInstance.current
    const stop = stops.find((item) => item.id === activeId)
    if (!map || !stop || !pinOk(stop)) return
    map.setView([stop.lat, stop.lng], Math.max(map.getZoom(), 14))
    markers.current.get(stop.id)?.openPopup()
  }, [ready, activeId, signature, stops])

  return <div ref={mapRef} className="absolute inset-0" />
}
