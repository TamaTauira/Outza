import assert from 'node:assert/strict'
import test from 'node:test'
import { destroyLeafletMap, guardGlLayer } from './leaflet-map'

test('a GL layer removed after the map pane is gone does not throw', () => {
  let removed = 0
  const layer = {
    _map: {},
    _glMap: { remove: () => { removed += 1 } },
    getPaneName: () => 'tilePane',
    onRemove(map: { getPane: (name: string) => unknown }) {
      map.getPane('tilePane')
      this._glMap.remove()
    },
  }
  guardGlLayer(layer)
  assert.doesNotThrow(() => layer.onRemove({ getPane: () => undefined }))
  assert.equal(removed, 1)
  assert.equal(layer._glMap, null)
})

test('a GL layer that never started is skipped', () => {
  const layer: any = {
    _map: null,
    _glMap: undefined,
    onRemove() { throw new Error('should not run') },
  }
  guardGlLayer(layer)
  assert.doesNotThrow(() => layer.onRemove(null))
})

test('destroying a map removes its layers before the map, and a second call is a no-op', () => {
  const order: string[] = []
  const layer = { id: 'basemap' }
  const map = {
    _vpRemoved: false,
    eachLayer(fn: (layer: unknown) => void) { fn(layer) },
    removeLayer() { order.push('layer') },
    remove() { order.push('map') },
  }
  destroyLeafletMap(map)
  destroyLeafletMap(map)
  assert.deepEqual(order, ['layer', 'map'])
})
