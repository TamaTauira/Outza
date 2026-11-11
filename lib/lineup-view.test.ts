import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lineupView } from './lineup-view'
import { cardPhoto } from './card-photo'

test('the line-up opens on List, and only an explicit Board choice comes back', () => {
  assert.equal(lineupView(null), 'list')
  assert.equal(lineupView(''), 'list')
  assert.equal(lineupView('list'), 'list')
  assert.equal(lineupView('map'), 'list')
  assert.equal(lineupView('board'), 'board')
})

test('a board card uses a real event photo and skips placeholders', () => {
  assert.equal(cardPhoto('https://cdn.example/gig.jpg'), 'https://cdn.example/gig.jpg')
  assert.equal(cardPhoto('https://picsum.photos/seed/bondi1/800/450'), null)
  assert.equal(cardPhoto(null), null)
  assert.equal(cardPhoto('/placeholders/music/square.webp'), null)
})
