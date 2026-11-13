import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'
import { eventPictureSrc, hasListingPhoto, placeholderAbsolute, placeholderPath, placeholderSlug, LOCAL_HOLDING_SLUGS, PLACEHOLDER_SLOTS, PLACEHOLDER_SLUGS } from './placeholders'

test('category names map onto the ten holding-image folders, and unknown categories use community', () => {
  const expected: Record<string, string> = {
    Music: 'music',
    'Arts & Culture': 'arts-culture',
    Sports: 'sports',
    'Food & Drink': 'food-drink',
    Family: 'family',
    Nightlife: 'nightlife',
    Community: 'community',
    Business: 'business',
    Wellness: 'wellness',
    Education: 'education',
  }
  for (const [name, slug] of Object.entries(expected)) {
    assert.equal(placeholderSlug(name), slug)
    assert.equal(placeholderPath(name, 'hero'), `/placeholders/${slug}/hero.webp`)
    assert.equal(placeholderPath(name, 'hero-wide'), `/placeholders/${slug}/hero-wide.webp`)
    assert.equal(placeholderPath(name, 'card'), `/placeholders/${slug}/card.webp`)
    assert.equal(placeholderPath(name, 'square'), `/placeholders/${slug}/square.webp`)
  }
  assert.equal(placeholderSlug('theatre'), 'arts-culture')
  assert.equal(placeholderSlug('kids'), 'family')
  // Local sections: four have their own scene, the rest reuse a genre image.
  const local: Record<string, string> = {
    'neighbourhood-popups': 'neighbourhood-popups',
    'garage-sales': 'garage-sales',
    'dog-friendly': 'dog-friendly',
    'charity-events': 'charity-events',
    'farmers-markets': 'community',
    markets: 'community',
    'warehouse-sales': 'community',
    'community-events': 'community',
    'school-fundraisers': 'family',
    'community-sport': 'sports',
    'local-art': 'arts-culture',
  }
  for (const [key, slug] of Object.entries(local)) assert.equal(placeholderSlug(key), slug, key)
  assert.equal(placeholderSlug('something-else'), 'community')
  assert.equal(placeholderSlug(null), 'community')
  assert.equal(PLACEHOLDER_SLUGS.length, 10)
  for (const slug of [...PLACEHOLDER_SLUGS, ...LOCAL_HOLDING_SLUGS]) {
    for (const slot of Object.keys(PLACEHOLDER_SLOTS)) {
      assert.equal(existsSync(`public/placeholders/${slug}/${slot}.webp`), true, `${slug}/${slot}`)
    }
  }
})

test('a missing picture uses the slot file, and emails get an absolute URL', () => {
  assert.equal(eventPictureSrc(null, 'Music', 'hero'), '/placeholders/music/hero.webp')
  assert.equal(eventPictureSrc(null, 'Music', 'popup'), '/placeholders/music/popup.webp')
  assert.equal(eventPictureSrc('https://cdn.example/a.jpg', 'Music', 'card'), 'https://cdn.example/a.jpg')
  assert.equal(placeholderAbsolute('Sports', 'og', 'https://outza-outza.vercel.app'), 'https://outza-outza.vercel.app/placeholders/sports/og.webp')
})

test('each holding slot is a distinct aspect, at the size the file is stored', () => {
  const aspects = new Set(Object.values(PLACEHOLDER_SLOTS).map((s) => `${s.w}x${s.h}`))
  assert.equal(aspects.size, Object.keys(PLACEHOLDER_SLOTS).length)
  assert.equal(PLACEHOLDER_SLOTS.hero.w / PLACEHOLDER_SLOTS.hero.h, 16 / 9)
  assert.equal(PLACEHOLDER_SLOTS['hero-wide'].w / PLACEHOLDER_SLOTS['hero-wide'].h, 3)
  assert.equal(PLACEHOLDER_SLOTS.card.w / PLACEHOLDER_SLOTS.card.h, 4 / 3)
  assert.equal(PLACEHOLDER_SLOTS.popup.w / PLACEHOLDER_SLOTS.popup.h, 5 / 2)
  assert.equal(PLACEHOLDER_SLOTS.og.w, 2400)
  assert.equal(PLACEHOLDER_SLOTS.og.h, 1256)
})

test('a listing photo is a real url or a processed variant, not a holding image', () => {
  assert.equal(hasListingPhoto(null, null), false)
  assert.equal(hasListingPhoto('https://cdn.example/a.jpg', null), true)
  assert.equal(hasListingPhoto(null, { sizes: { hero: [960, 1920] } }), true)
  assert.equal(hasListingPhoto(null, { sizes: {} }), false)
})
