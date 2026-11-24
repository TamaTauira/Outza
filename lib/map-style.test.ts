import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eventPinHtml, MAP_ATTRIBUTION, MAP_STYLE_DARK, MAP_STYLE_LIGHT, vibeMapStyle } from './map-style'

test('the basemap uses OpenFreeMap stock styles and keeps attribution', () => {
  assert.equal(vibeMapStyle(false), MAP_STYLE_LIGHT)
  assert.equal(vibeMapStyle(true), MAP_STYLE_DARK)
  assert.equal(MAP_STYLE_LIGHT, 'https://tiles.openfreemap.org/styles/positron')
  assert.equal(MAP_STYLE_DARK, 'https://tiles.openfreemap.org/styles/dark')
  assert.match(MAP_ATTRIBUTION, /href="https:\/\/openfreemap.org"/)
  assert.match(MAP_ATTRIBUTION, /href="https:\/\/www\.openmaptiles\.org\/"/)
  assert.match(MAP_ATTRIBUTION, /href="https:\/\/www\.openstreetmap\.org\/copyright"/)
  assert.match(MAP_ATTRIBUTION, /OpenStreetMap<\/a> contributors/)
})

test('the event pin is an orange teardrop', () => {
  const html = eventPinHtml('#FF7A35', 'A')
  assert.match(html, /#FF7A35/)
  assert.match(html, />A</)
  assert.match(html, /class="se-pin"/)
})
