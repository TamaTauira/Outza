import assert from 'node:assert/strict'
import { test } from 'node:test'
import { roamBottomChrome, wantsBottomNav } from './bottom-nav'

const phone = { pointerCoarse: true, horizontalSegments: 1 }
const tablet = { pointerCoarse: true, horizontalSegments: 1 }
const desktop = { pointerCoarse: false, horizontalSegments: 1 }

test('bottom nav covers phones, tablet portrait, folds and a side-by-side span', () => {
  assert.equal(wantsBottomNav({ ...phone, width: 320, height: 568 }), true)
  assert.equal(wantsBottomNav({ ...phone, width: 375, height: 667 }), true)
  assert.equal(wantsBottomNav({ ...phone, width: 390, height: 844 }), true)
  assert.equal(wantsBottomNav({ ...phone, width: 430, height: 932 }), true)
  assert.equal(wantsBottomNav({ ...phone, width: 932, height: 430 }), true)
  assert.equal(wantsBottomNav({ ...phone, width: 667, height: 375 }), true)
  assert.equal(wantsBottomNav({ ...phone, width: 344, height: 882 }), true)
  assert.equal(wantsBottomNav({ ...phone, width: 690, height: 829 }), true)
  assert.equal(wantsBottomNav({ ...phone, width: 884, height: 1104 }), true)
  assert.equal(wantsBottomNav({ ...tablet, width: 768, height: 1024 }), true)
  assert.equal(wantsBottomNav({ ...tablet, width: 820, height: 1180 }), true)
  assert.equal(wantsBottomNav({ ...tablet, width: 834, height: 1194 }), true)
  assert.equal(wantsBottomNav({ ...tablet, width: 1024, height: 1366 }), true)
  assert.equal(wantsBottomNav({ ...tablet, width: 507, height: 1024 }), true)
  assert.equal(wantsBottomNav({ ...phone, width: 540, height: 720 }), true)
  assert.equal(wantsBottomNav({ ...desktop, width: 1080, height: 720, horizontalSegments: 2 }), true)
  assert.equal(wantsBottomNav({ ...tablet, width: 1114, height: 720, horizontalSegments: 2 }), true)
})

test('tablet landscape and desktop keep the header links', () => {
  assert.equal(wantsBottomNav({ ...tablet, width: 1024, height: 768 }), false)
  assert.equal(wantsBottomNav({ ...tablet, width: 1180, height: 820 }), false)
  assert.equal(wantsBottomNav({ ...tablet, width: 1194, height: 834 }), false)
  assert.equal(wantsBottomNav({ ...tablet, width: 1366, height: 1024 }), false)
  assert.equal(wantsBottomNav({ ...desktop, width: 1280, height: 800 }), false)
  assert.equal(wantsBottomNav({ ...desktop, width: 1440, height: 900 }), false)
  assert.equal(wantsBottomNav({ ...desktop, width: 1100, height: 1400 }), false)
  assert.equal(wantsBottomNav({ ...desktop, width: 900, height: 800 }), true)
})

test('mascot chrome clears the bar and stays put on desktop', () => {
  assert.equal(roamBottomChrome({ mobile: false, map: false, navOffset: 0, segmentLimited: false }), 20)
  assert.equal(roamBottomChrome({ mobile: true, map: false, navOffset: 0, segmentLimited: false }), 96)
  assert.equal(roamBottomChrome({ mobile: true, map: true, navOffset: 0, segmentLimited: false }), 176)
  const phoneNav = roamBottomChrome({ mobile: true, map: false, navOffset: 90, segmentLimited: false })
  assert.ok(phoneNav >= 90 + 96)
  const tabletNav = roamBottomChrome({ mobile: false, map: false, navOffset: 72, segmentLimited: false })
  assert.ok(tabletNav > 72)
  assert.ok(roamBottomChrome({ mobile: true, map: false, navOffset: 90, segmentLimited: true }) < 80)
})
