import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePhotoList } from './ownership'
import { venueHoursLine } from './venue-profile'

test('photo links are https and capped at eight', () => {
  const ok = parsePhotoList('https://cdn.example/a.jpg\nhttps://cdn.example/b.jpg')
  assert.equal(ok.ok, true)
  if (ok.ok) assert.equal(ok.photos.length, 2)
  assert.equal(parsePhotoList('http://cdn.example/a.jpg').ok, false)
  assert.equal(parsePhotoList(Array.from({ length: 9 }, (_, i) => `https://cdn.example/${i}.jpg`).join('\n')).ok, false)
  const cleared = parsePhotoList('')
  assert.equal(cleared.ok && cleared.photos.length, 0)
})

test('hours use only the text and clock the venue saved', () => {
  assert.equal(venueHoursLine({ hoursNote: 'Wed–Sun', openTime: '17:00', closeTime: '23:00' }), 'Wed–Sun (17:00–23:00)')
  assert.equal(venueHoursLine({ openTime: '17:00', closeTime: '23:00' }), 'Open 17:00–23:00')
  assert.equal(venueHoursLine({}), null)
})
