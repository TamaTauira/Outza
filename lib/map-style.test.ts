import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eventPinHtml } from './map-style'
import light from './maps/vibe-light.json'
import dark from './maps/vibe-dark.json'

const layer = (style: { layers: { id: string; paint?: Record<string, unknown> }[] }, id: string) =>
  style.layers.find((item) => item.id === id)

test('branded map styles stay labelled and attribute OpenFreeMap', () => {
  const attribution = (light as { sources: { openmaptiles: { attribution: string } } }).sources.openmaptiles.attribution
  assert.match(attribution, /OpenFreeMap/)
  assert.match(attribution, /OpenStreetMap/)
  for (const id of ['park', 'water', 'poi_transit', 'highway-name-minor', 'highway-name-major', 'label_city', 'building']) {
    assert.ok(layer(light as never, id), id)
    assert.ok(layer(dark as never, id), id)
  }
  assert.equal(layer(light as never, 'road_motorway')?.paint?.['line-color'], '#f0782a')
  assert.equal(layer(dark as never, 'background')?.paint?.['background-color'], '#1c1916')
  assert.equal(layer(dark as never, 'road_motorway')?.paint?.['line-color'], '#ff7a1a')
})

test('the event pin is an orange teardrop', () => {
  const html = eventPinHtml('#FF7A1A', 'A')
  assert.match(html, /#FF7A1A/)
  assert.match(html, />A</)
  assert.match(html, /class="se-pin"/)
})
