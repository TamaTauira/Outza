/**
 * Leaflet tears a map down by detaching the pane and then calling every layer's
 * onRemove. The MapLibre layer's onRemove calls `_glMap.remove()`. If the GL map
 * never finished starting, or the pane is already gone, that read throws
 * "Cannot read properties of undefined (reading 'remove')" and takes the page
 * down. Guard the layer, and remove layers while the map is still intact.
 */

export function guardGlLayer(layer: any) {
  const original = layer.onRemove
  layer.onRemove = function (this: any, map: any) {
    if (!this._glMap) return
    const paneName = this.getPaneName?.() || 'tilePane'
    const pane = map?.getPane?.(paneName)
    if (!map || !this._map || !pane) {
      try { this._glMap.remove() } catch { /* the GL map is already gone */ }
      this._glMap = null
      return
    }
    try {
      original?.call(this, map)
    } catch {
      try { this._glMap?.remove() } catch { /* already removed */ }
      this._glMap = null
    }
  }
}

export function mapIsLive(map: any) {
  return !!map && !map._vpRemoved && !!map.getContainer?.()
}

/** Remove layers first, then the map. Safe to call twice. */
export function destroyLeafletMap(map: any) {
  if (!map || map._vpRemoved) return
  map._vpRemoved = true
  const layers: unknown[] = []
  try { map.eachLayer?.((layer: any) => layers.push(layer)) } catch { /* no layer list */ }
  for (const layer of layers) {
    try { map.removeLayer?.(layer) } catch { /* layer already detached */ }
  }
  try { map.remove?.() } catch { /* container already gone */ }
}
