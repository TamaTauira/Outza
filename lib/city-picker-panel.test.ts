import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CITY_PICKER_PANEL_EDGE,
  CITY_PICKER_PANEL_GAP,
  CITY_PICKER_PANEL_MAX_HEIGHT,
  CITY_PICKER_PANEL_MIN_WIDTH,
  cityPickerPanelBox,
} from './city-picker-panel'

test('panel hangs under the trigger at the trigger width when there is room', () => {
  const box = cityPickerPanelBox({ bottom: 200, left: 100, width: 304 }, { width: 1440, height: 900 })
  assert.equal(box.top, 200 + CITY_PICKER_PANEL_GAP)
  assert.equal(box.left, 100)
  assert.equal(box.width, 304)
  assert.equal(box.maxHeight, CITY_PICKER_PANEL_MAX_HEIGHT)
})

test('panel height is capped by the space left below the trigger', () => {
  // Phone hero: the trigger ends a little past halfway down an 844pt screen.
  const box = cityPickerPanelBox({ bottom: 430, left: 36, width: 318 }, { width: 390, height: 844 })
  assert.equal(box.maxHeight, 844 - (430 + CITY_PICKER_PANEL_GAP) - CITY_PICKER_PANEL_EDGE)
  assert.ok(box.maxHeight < CITY_PICKER_PANEL_MAX_HEIGHT)
  assert.ok(box.top + box.maxHeight <= 844 - CITY_PICKER_PANEL_EDGE)
})

test('panel never runs past the viewport bottom, wherever the trigger sits', () => {
  for (const height of [568, 720, 844, 900, 1080]) {
    for (let bottom = 0; bottom <= height - 64; bottom += 37) {
      const box = cityPickerPanelBox({ bottom, left: 24, width: 280 }, { width: 390, height })
      assert.ok(box.maxHeight >= 0, `negative cap at bottom=${bottom} height=${height}`)
      assert.ok(
        box.top + box.maxHeight <= height - CITY_PICKER_PANEL_EDGE,
        `panel bottom ${box.top + box.maxHeight} past ${height - CITY_PICKER_PANEL_EDGE} (bottom=${bottom}, height=${height})`,
      )
    }
  }
})

test('a trigger already at the viewport bottom gets a zero cap, never a negative one', () => {
  const box = cityPickerPanelBox({ bottom: 900, left: 24, width: 280 }, { width: 390, height: 900 })
  assert.equal(box.maxHeight, 0)
})

test('panel widens a narrow trigger to the minimum width and stays inside a folded phone', () => {
  // Galaxy Fold folded: 280pt wide, the hero leaves a 208pt slot.
  const box = cityPickerPanelBox({ bottom: 300, left: 36, width: 208 }, { width: 280, height: 720 })
  assert.equal(box.width, CITY_PICKER_PANEL_MIN_WIDTH)
  assert.ok(box.left >= CITY_PICKER_PANEL_EDGE)
  assert.ok(box.left + box.width <= 280 - CITY_PICKER_PANEL_EDGE)
})

test('panel shifts left rather than spilling off the right edge', () => {
  const box = cityPickerPanelBox({ bottom: 100, left: 1200, width: 304 }, { width: 1280, height: 800 })
  assert.equal(box.left, 1280 - CITY_PICKER_PANEL_EDGE - 304)
  assert.ok(box.left + box.width <= 1280 - CITY_PICKER_PANEL_EDGE)
})
