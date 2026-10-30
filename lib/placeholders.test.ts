import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eventPictureSrc, placeholderAbsolute, placeholderPath, placeholderSlug, PLACEHOLDER_SLUGS } from './placeholders'

test('category names map onto the ten placeholder files, and unknown categories use community', () => {
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
    assert.equal(placeholderPath(name, 'wide'), `/placeholders/${slug}.webp`)
    assert.equal(placeholderPath(name, 'square'), `/placeholders/${slug}-square.webp`)
  }
  assert.equal(placeholderSlug('theatre'), 'arts-culture')
  assert.equal(placeholderSlug('kids'), 'family')
  assert.equal(placeholderSlug('something-else'), 'community')
  assert.equal(placeholderSlug(null), 'community')
  assert.equal(PLACEHOLDER_SLUGS.length, 10)
})

test('a missing picture uses the placeholder, and emails get an absolute URL', () => {
  assert.equal(eventPictureSrc(null, 'Music', 'wide'), '/placeholders/music.webp')
  assert.equal(eventPictureSrc('https://cdn.example/a.jpg', 'Music', 'square'), 'https://cdn.example/a.jpg')
  assert.equal(placeholderAbsolute('Sports', 'square', 'https://outza-outza.vercel.app'), 'https://outza-outza.vercel.app/placeholders/sports-square.webp')
})
