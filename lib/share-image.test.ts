import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BRAND_OG_IMAGE } from './brand'
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, firstHttpsShareUrl, httpsShareUrl, openGraphImage } from './share-image'

test('share image URLs upgrade http to https on the same host and never emit http', () => {
  assert.equal(httpsShareUrl('http://cdn.example.com/a.jpg?x=1'), 'https://cdn.example.com/a.jpg?x=1')
  assert.equal(httpsShareUrl('HTTP://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg')
  assert.equal(httpsShareUrl('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg')
  assert.equal(httpsShareUrl('/og-image.png?v=3'), '/og-image.png?v=3')
  assert.equal(httpsShareUrl('//cdn.example.com/a.jpg'), null)
  assert.equal(httpsShareUrl('data:image/png;base64,aaaa'), null)
  assert.equal(httpsShareUrl(''), null)
  assert.equal(firstHttpsShareUrl(['not a url', 'http://cdn.example.com/logo.png']), 'https://cdn.example.com/logo.png')

  const upgraded = openGraphImage('http://images.example.com/gig.jpg', 'Friday gig')
  assert.equal(upgraded.url, 'https://images.example.com/gig.jpg')
  assert.equal(upgraded.width, OG_IMAGE_WIDTH)
  assert.equal(upgraded.height, OG_IMAGE_HEIGHT)
  assert.equal(upgraded.alt, 'Friday gig')
  assert.equal(upgraded.url.startsWith('http://'), false)

  const fallback = openGraphImage('not a url', 'VibePeep')
  assert.equal(fallback.url, BRAND_OG_IMAGE)
  assert.equal(fallback.width, 1200)
  assert.equal(fallback.height, 630)
  assert.equal(fallback.url.includes('http://'), false)
})
