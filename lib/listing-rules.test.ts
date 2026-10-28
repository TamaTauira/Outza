import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyCategory, areasForCity, conflictsWithMusicIntent, isKidsDanceClass, presentListing, reconcileSuburb, refineStoredCategory } from './categories'
import { displaySuburb, tidyVenueName } from './cities'
import { isTonightSlot } from './seo'
import { interpretQuery } from './ai-search-parse'

test('tonight is a 5pm start, not a morning event that happens to end later', () => {
  assert.equal(isTonightSlot('06:00', '21:00'), false)
  assert.equal(isTonightSlot('09:30', '17:00'), false)
  assert.equal(isTonightSlot('10:00', '18:00'), false)
  assert.equal(isTonightSlot('16:59'), false)
  assert.equal(isTonightSlot('17:00'), true)
  assert.equal(isTonightSlot('19:30', '22:00'), true)
  assert.equal(isTonightSlot(null), true)
  assert.equal(isTonightSlot(''), true)
})

test('live music intent stays on music and drops film, theatre and comedy mistags', () => {
  const tonight = interpretQuery('live music tonight', '2026-10-28', { category: 'Arts & Culture', dateFrom: '2026-10-28', dateTo: '2026-11-11' })
  assert.equal(tonight.category, 'Music')
  assert.equal(tonight.timeOfDay, 'evening')

  assert.equal(conflictsWithMusicIntent('Laughs on Tap - Great Comedy, Cheap Drinks', 'a hilarious night'), true)
  assert.equal(conflictsWithMusicIntent('Antigone', 'A heartbreaking 75 minute free show', ['Theatre', 'Classical']), true)
  assert.equal(conflictsWithMusicIntent('UNBROKEN: THE UNTOLD STORY OF SHEN YUN', 'Join us for a public screening of UNBROKEN, a documentary'), true)
  assert.equal(conflictsWithMusicIntent('Ivan Aristeguieta- READY TO MAMBO', 'Best Comedy Weekly Award. hilarious, award-winning show'), true)
  assert.equal(conflictsWithMusicIntent('The Teskey Brothers', 'Enmore Theatre, doors 7pm'), false)
  assert.equal(conflictsWithMusicIntent('Jazz gig at the State Theatre', ''), false)
})

test('category rules keep networking and kids dance out of the wrong bucket', () => {
  const bni = classifyCategory('Breakfast Networking Event - BNI Presidential', 'Join us for a meeting to see how it works.', ['Performing Arts', 'partnership'])
  assert.equal(bni.category, 'Business')

  const collective = classifyCategory('BNI NETWORK COLLECTIVE', 'Meet like-minded business owners and make new connections.', ['Arts'])
  assert.equal(collective.category, 'Business')

  const ballet = classifyCategory('Ballet class: Dance with Me 1.5-3 yrs (Pyrmont)', 'Explore movement and music together in creative and engaging activities', ['Music'])
  assert.equal(ballet.category, 'Family')
  assert.equal(isKidsDanceClass('Ballet Class: Little Ballet 3-5 years (Glebe)'), true)

  const showcase = classifyCategory('School Dance Showcase', 'An evening performance', ['Music'])
  assert.notEqual(showcase.category, 'Family')

  const stored = refineStoredCategory({
    title: 'Antigone',
    description: 'A heartbreaking 75 minute free show',
    category: 'Music',
    subTags: ['Classical', 'Theatre', 'Visual Arts'],
  })
  assert.equal(stored?.category, 'Arts & Culture')
  assert.equal(stored?.subTags.includes('Theatre'), true)
  assert.equal(stored?.subTags.includes('Classical'), false)
})

test('CBD is not the suburb for the rest of Sydney, and a city name is not a venue', () => {
  assert.equal(reconcileSuburb('CBD', 'Elouera Surf Life Saving Club', '80 Mitchell Road, Cronulla, NSW 2230', 'Sydney'), 'Cronulla')
  assert.equal(reconcileSuburb('CBD', 'Cafe Gusto', '10 Lord Street, Botany, NSW 2019', 'Sydney'), 'Botany')
  assert.equal(reconcileSuburb('CBD', 'Bankstown Sports Club', '8 Greenfield Parade, Bankstown, NSW 2200', 'Sydney'), 'Bankstown')
  assert.equal(reconcileSuburb('CBD', 'Art Gallery of NSW', 'Art Gallery Road, Sydney, NSW 2000', 'Sydney'), 'CBD')
  assert.equal(reconcileSuburb('CBD', 'Somewhere', 'Sydney, NSW', 'Sydney'), null)
  assert.equal(displaySuburb('CBD', 'Dolphins Point, Coogee, NSW 2034', 'Sydney'), 'Coogee')
  assert.equal(tidyVenueName('Sydney', 'Lilyfield, NSW', 'Sydney'), 'Lilyfield')
  assert.equal(tidyVenueName('Sydney Opera House', 'Bennelong Point, Sydney NSW 2000', 'Sydney'), 'Sydney Opera House')

  const shown = presentListing({
    title: 'Curtains Jazz Festival',
    description: 'Live music',
    category: 'Music',
    subTags: [],
    venueName: 'Sydney',
    venueAddress: 'Lilyfield, NSW',
    suburb: 'CBD',
    city: 'Sydney',
  })
  assert.equal(shown.suburb, 'Lilyfield')
  assert.equal(shown.venueName, 'Lilyfield')
  assert.equal(shown.category, 'Music')
})

test('area choices follow the city', () => {
  assert.equal(areasForCity('Melbourne').includes('Fitzroy'), true)
  assert.equal(areasForCity('Melbourne').includes('Surry Hills'), false)
  assert.equal(areasForCity('Sydney').includes('Surry Hills'), true)
  assert.equal(areasForCity('').length, 0)
})
