import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyCategory, areasForCity, checkLGBTI, conflictsWithMusicIntent, isKidsDanceClass, presentListing, reconcileSuburb, refineStoredCategory, retagLgbti } from './categories'
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

test('sub-tags need a real genre, not a loose word or a broad segment', () => {
  const hoopla = classifyCategory('Harbour Hoopla Boat Party 2026!', 'Get ready to rock the boat at SQI\'s Legendary Harbour Hoopla 2026!', ['Music'])
  assert.equal(hoopla.category, 'Music')
  assert.equal(hoopla.subTags.includes('Rock'), false)

  const partyOnly = classifyCategory('Harbour Hoopla Boat Party 2026!', 'Get ready to rock the boat', [])
  assert.equal(partyOnly.category, 'Nightlife')
  assert.equal(partyOnly.subTags.includes('Party'), true)
  assert.equal(partyOnly.subTags.includes('Rock'), false)

  const rockShow = classifyCategory('Pub rock night', 'A rock band and classic rock set', [])
  assert.equal(rockShow.subTags.includes('Rock'), true)

  const fromSource = classifyCategory('Powderfinger', '', ['Rock'])
  assert.equal(fromSource.category, 'Music')
  assert.equal(fromSource.subTags.includes('Rock'), true)

  const segment = classifyCategory('Aaron Chen - Technology', '', ['Arts & Theatre', 'Comedy'])
  assert.equal(segment.category, 'Arts & Culture')
  assert.equal(segment.subTags.includes('Comedy'), true)
  assert.equal(segment.subTags.includes('Theatre'), false)

  const graduation = classifyCategory('Class of 2026 Graduation Ceremony', 'Approximate Running Times: Doors 5:30PM', [])
  assert.equal(graduation.subTags.includes('Running'), false)
  assert.notEqual(graduation.category, 'Sports')

  const run = classifyCategory('Sunrise run club', 'A 5km running session', [])
  assert.equal(run.subTags.includes('Running'), true)

  const cinema = classifyCategory('Cinema at Sydney Opera House', 'A film on the forecourt', [])
  assert.equal(cinema.subTags.includes('Opera'), false)

  const nation = classifyCategory('Book launch', 'Giving the country\'s indie scene a fresh voice', ['Country'])
  assert.equal(nation.subTags.includes('Country'), true)
  const countryside = classifyCategory('Book launch', 'Giving the country\'s indie scene a fresh voice', [])
  assert.equal(countryside.subTags.includes('Country'), false)

  const edm = classifyCategory('Warehouse night', '', ['Dance/Electronic'])
  assert.equal(edm.category, 'Music')
  assert.equal(edm.subTags.includes('Electronic/EDM'), true)
  assert.equal(edm.subTags.includes('Dance'), false)
})

test('stored loose tags are removed and a real source tag is kept', () => {
  const hoopla = refineStoredCategory({
    title: 'Harbour Hoopla Boat Party 2026!',
    description: 'Get ready to rock the boat at SQI\'s Legendary Harbour Hoopla 2026!',
    category: 'Music',
    subTags: ['Rock'],
  })
  assert.equal(hoopla?.category, 'Music')
  assert.equal(hoopla?.subTags.includes('Rock'), false)

  const powder = refineStoredCategory({
    title: 'Powderfinger',
    description: 'Live 2027',
    category: 'Music',
    subTags: ['Rock'],
  })
  assert.equal(powder, null)

  const comic = refineStoredCategory({
    title: 'Aaron Chen - Technology',
    description: '',
    category: 'Arts & Culture',
    subTags: ['Theatre', 'Comedy'],
  })
  assert.equal(comic?.subTags.includes('Comedy'), true)
  assert.equal(comic?.subTags.includes('Theatre'), false)

  const ceremony = refineStoredCategory({
    title: 'Class of 2026 Graduation Ceremony',
    description: 'Approximate Running Times: Doors 5:30PM',
    category: 'Sports',
    subTags: ['Running'],
  })
  assert.equal(ceremony?.category, 'Community')
  assert.equal(ceremony?.subTags.includes('Running'), false)

  const mma = refineStoredCategory({
    title: 'Eternal MMA #111',
    description: 'Approximate Running Times: Doors 2:30pm',
    category: 'Sports',
    subTags: ['Running', 'Martial Arts'],
  })
  assert.equal(mma?.category, 'Sports')
  assert.equal(mma?.subTags.includes('Martial Arts'), true)
  assert.equal(mma?.subTags.includes('Running'), false)
})

test('LGBTIQ+ follows identity words and source labels, not a loose pride or trans', () => {
  assert.equal(checkLGBTI('Harbour Hoopla Boat Party', 'Get ready to rock the boat', ['LGBT']), true)
  assert.equal(checkLGBTI('Rainbow pride party', ''), true)
  assert.equal(checkLGBTI('Drag Racing at Sydney Dragway', 'Run club members get a discount.'), false)
  assert.equal(checkLGBTI('Zim QLD Annual Gala', 'Where elegance meets Zimbabwean Pride'), false)
  assert.equal(checkLGBTI('Trans-Tasman series', 'A sailing race'), false)
  assert.equal(retagLgbti(true, 'Harbour Hoopla Boat Party', 'Get ready to rock the boat'), true)
  assert.equal(retagLgbti(true, 'Zim QLD Annual Gala', 'Where elegance meets Zimbabwean Pride'), false)
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
  assert.equal(tidyVenueName('Online', 'Online, NSW', 'Sydney'), 'Online')

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
