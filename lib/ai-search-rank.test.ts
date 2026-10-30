import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { interpretQuery } from './ai-search-parse'
import { rankAskRows, type AskRow } from './ai-search-rank'

const FRIDAY = '2026-10-30'
const markets = JSON.parse(readFileSync(new URL('./ai-search-weekend-markets.json', import.meta.url), 'utf8')) as AskRow[]

const decoys: AskRow[] = [
  { id: 'picnic-community', title: 'Picnic Under the Bridge', date: '2026-10-31', time: '10:00', venueName: 'Dawes Point', suburb: 'Dawes Point', city: 'Sydney', category: 'Community', subTags: ['Markets'], isFree: true, price: 'Free', priceMin: 0, description: 'A community market picnic under the bridge.' },
  { id: 'picnic-arts', title: 'Picnic Under the Bridge', date: '2026-10-30', time: '10:00', venueName: 'Dawes Point', suburb: 'Dawes Point', city: 'Sydney', category: 'Arts & Culture', subTags: [], isFree: true, price: 'Free', priceMin: 0 },
  { id: 'boat', title: 'Girls Only Halloween Boat Party', date: '2026-10-30', time: '19:00', venueName: 'Darling Harbour', suburb: 'Darling Harbour', city: 'Sydney', category: 'Nightlife', subTags: ['Party'], isFree: false, price: '$40', priceMin: 40, description: 'Trivia, wine, beer and drag on the harbour.' },
  { id: 'yoga', title: 'Rooftop Yoga', date: '2026-10-31', time: '08:00', venueName: 'Rooftop', suburb: 'CBD', city: 'Melbourne', category: 'Wellness', subTags: ['Yoga'], isFree: true, price: '$25', priceMin: 25 },
  { id: 'hardcore', title: 'A Very Hardcore Halloween', date: '2026-10-31', time: '21:00', venueName: 'The Triffid', suburb: 'Newstead', city: 'Brisbane', category: 'Music', subTags: [], isFree: true, price: '$30', priceMin: 30 },
  { id: 'drag-race', title: 'Drag Racing at Sydney Dragway', date: '2026-10-30', time: '18:00', venueName: 'Sydney Dragway', suburb: 'Eastern Creek', city: 'Sydney', category: 'Sports', subTags: ['Motorsport'], isFree: false, price: '$20', priceMin: 20, description: 'Run club members get a discount.' },
  { id: 'film', title: 'Harbour Film Festival', date: '2026-10-31', time: '18:00', venueName: 'Dendy', suburb: 'Newtown', city: 'Sydney', category: 'Arts & Culture', subTags: ['Film'], isFree: false, price: '$18', priceMin: 18, description: 'A theatre-style screening weekend.' },
  { id: 'play', title: 'Bell Shakespeare Theatre', date: '2026-10-31', time: '19:30', venueName: 'Sydney Opera House', suburb: 'Circular Quay', city: 'Sydney', category: 'Arts & Culture', subTags: ['Theatre'], isFree: false, price: '$49', priceMin: 49 },
  { id: 'quiz', title: 'Pub Quiz at the Local', date: '2026-10-30', time: '19:00', venueName: 'The Local', suburb: 'Newtown', city: 'Sydney', category: 'Nightlife', subTags: [], isFree: true, price: 'Free', priceMin: 0 },
  { id: 'run', title: 'Sunrise Run Club', date: '2026-10-30', time: '06:30', venueName: 'Centennial Park', suburb: 'Paddington', city: 'Sydney', category: 'Sports', subTags: ['Running'], isFree: true, price: 'Free', priceMin: 0 },
  { id: 'wine', title: 'Wine Tasting Under the Stars', date: '2026-10-30', time: '18:00', venueName: 'The Cellar', suburb: 'Surry Hills', city: 'Sydney', category: 'Food & Drink', subTags: ['Wine Tasting'], isFree: false, price: '$35', priceMin: 35 },
  { id: 'opera', title: 'La Traviata', date: '2026-11-01', time: '19:30', venueName: 'Sydney Opera House', suburb: 'Circular Quay', city: 'Sydney', category: 'Arts & Culture', subTags: ['Opera'], isFree: false, price: '$80', priceMin: 80 },
  { id: 'show', title: 'Modern Art Exhibition', date: '2026-11-02', time: '10:00', venueName: 'Art Gallery of NSW', suburb: 'CBD', city: 'Sydney', category: 'Arts & Culture', subTags: ['Exhibition'], isFree: true, price: 'Free', priceMin: 0 },
  { id: 'hop', title: 'Hip Hop Night', date: '2026-11-01', time: '21:00', venueName: 'Oxford Art Factory', suburb: 'Darlinghurst', city: 'Sydney', category: 'Music', subTags: ['Hip Hop'], isFree: false, price: '$25', priceMin: 25 },
  { id: 'food', title: 'Melbourne Food Festival', date: '2026-11-08', time: '11:00', venueName: 'Federation Square', suburb: 'CBD', city: 'Melbourne', category: 'Food & Drink', subTags: ['Food Fair'], isFree: false, price: '$15', priceMin: 15 },
]

const pool = [...markets, ...decoys]

function ask(q: string, city = '') {
  const filters = interpretQuery(q, FRIDAY)
  return rankAskRows(pool, { ...filters, city: filters.city || city })
}

test('Markets this weekend in Sydney returns the Sydney markets, not Picnic Under the Bridge', () => {
  const sydney = new Set(markets.filter((row) => row.city === 'Sydney').map((row) => row.title))
  const results = rankAskRows(pool, { ...interpretQuery('Markets this weekend', FRIDAY), city: 'Sydney' }, 50)
  assert.ok(results.length >= sydney.size)
  for (const title of sydney) assert.ok(results.some((row) => row.title === title), title)
  assert.equal(results.some((row) => row.title === 'Picnic Under the Bridge'), false)
  const bondi = results.find((row) => row.title === 'Bondi Farmers Market')
  assert.equal(bondi?.category, 'Food & Drink')
  const rocks = results.find((row) => row.title === 'The Rocks Markets')
  assert.equal(rocks?.category, 'Arts & Culture')
})

test('named markets, suburbs, typos and topic queries stay on the matching titles', () => {
  assert.ok(ask('glebe markets', 'Sydney').every((row) => row.title === 'Glebe Markets'))
  assert.ok(ask('glebe markets', 'Sydney').length >= 1)
  assert.ok(ask('Queen Victoria Market').every((row) => row.title === 'Queen Victoria Market'))
  assert.ok(ask('the rocks markets', 'Sydney').every((row) => row.title === 'The Rocks Markets'))
  assert.ok(ask('markets in Bondi this weekend', 'Sydney').some((row) => row.title === 'Bondi Farmers Market'))
  assert.ok(ask('fremantle markets').some((row) => row.title === 'Fremantle Markets'))
  assert.ok(ask('markts', 'Sydney').some((row) => /market/i.test(row.title)))
  assert.equal(ask('markts', 'Sydney').some((row) => row.title === 'Picnic Under the Bridge'), false)
  assert.ok(ask('bazaar', 'Sydney').some((row) => /market/i.test(row.title)))
  assert.ok(ask('makers market', 'Sydney').some((row) => /market/i.test(row.title)))
  assert.equal(ask('makers market', 'Sydney').some((row) => row.title === 'Picnic Under the Bridge'), false)

  const trivia = ask('trivia tonight', 'Sydney')
  assert.equal(trivia.some((row) => row.title === 'Girls Only Halloween Boat Party'), false)
  assert.equal(trivia.some((row) => row.id === 'quiz'), false)

  const quiz = ask('pub quiz', 'Sydney')
  assert.deepEqual(quiz.map((row) => row.id), ['quiz'])

  const run = ask('run club', 'Sydney')
  assert.deepEqual(run.map((row) => row.id), ['run'])

  const wine = ask('wine tonight', 'Sydney')
  assert.deepEqual(wine.map((row) => row.id), ['wine'])

  const theatre = ask('theatre this weekend', 'Sydney')
  assert.deepEqual(theatre.map((row) => row.id), ['play'])

  assert.ok(ask('opera', 'Sydney').some((row) => row.id === 'opera'))
  assert.ok(ask('hip hop', 'Sydney').some((row) => row.id === 'hop'))
  assert.ok(ask('art exhibition', 'Sydney').some((row) => row.id === 'show'))
  assert.ok(ask('food festival').some((row) => row.id === 'food'))
  assert.deepEqual(ask('comdey', 'Sydney').map((row) => row.id), [])
})

test('free excludes a paid listing even when isFree was set', () => {
  const free = ask('free events this weekend', 'Melbourne')
  assert.equal(free.some((row) => row.id === 'yoga'), false)
  const brisbane = ask('free events this weekend', 'Brisbane')
  assert.equal(brisbane.some((row) => row.id === 'hardcore'), false)
  assert.ok(free.every((row) => row.priceMin == null || row.priceMin <= 0))
})
