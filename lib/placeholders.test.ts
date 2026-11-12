import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'
import { eventPictureSrc, hasListingPhoto, placeholderAbsolute, placeholderPath, placeholderSlug, PLACEHOLDER_SLOTS, PLACEHOLDER_SLUGS } from './placeholders'

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
  assert.equal(placeholderSlug('garage-sales'), 'garage-sales')
  assert.equal(placeholderSlug('farmers-markets'), 'farmers-markets')
  assert.equal(placeholderPath('farmers-markets', 'card', 1), '/placeholders/farmers-markets/card-b.webp')
  assert.equal(placeholderPath('Music', 'card', 1), '/placeholders/music/card.webp')
  assert.equal(placeholderSlug('something-else'), 'community')
  assert.equal(placeholderSlug(null), 'community')
  assert.equal(PLACEHOLDER_SLUGS.length, 10)
  for (const slug of ['farmers-markets', 'community-sport', 'community-events', 'garage-sales', 'school-fundraisers', 'charity-events', 'dog-friendly', 'local-art', 'warehouse-sales', 'neighbourhood-popups']) {
    assert.equal(existsSync(`public/placeholders/${slug}/card.webp`), true, slug)
    assert.equal(existsSync(`public/placeholders/${slug}/card-b.webp`), true, `${slug} variant`)
    assert.equal(existsSync(`public/placeholders/${slug}/hero-wide.webp`), true, `${slug} wide`)
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
