/** MapLibre vector basemap inside Leaflet, so the Map page can keep its clusters. */
import { setWorkerUrl } from 'maplibre-gl'
import { MAP_MAX_ZOOM, vibeMapStyle } from '@/lib/map-style'
import 'maplibre-gl/dist/maplibre-gl.css'

// Turbopack rewrites import.meta.url, so MapLibre's relative worker URL 404s.
// The worker file is the package's own module worker, copied to /public.
if (typeof window !== 'undefined') setWorkerUrl('/maplibre-gl-worker.mjs')

export async function createBasemap(L: any, dark: boolean) {
  const mod = await import('@maplibre/maplibre-gl-leaflet')
  const maplibreGL = (mod as { default?: (options: object) => any }).default
    ?? (mod as { maplibreGL?: (options: object) => any }).maplibreGL
    ?? (L.maplibreGL as ((options: object) => any) | undefined)
  if (!maplibreGL) throw new Error('MapLibre layer failed to load')
  return maplibreGL({
    style: vibeMapStyle(dark),
    maxZoom: MAP_MAX_ZOOM + 1,
    interactive: false,
    attributionControl: false,
  })
}
