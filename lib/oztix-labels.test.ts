import assert from 'node:assert/strict'
import { test } from 'node:test'
import { refineStoredCategory } from './categories'
import { classifyOztixListing, oztixGenreLabels } from './oztix-labels'

const BOND = `Tonight, we will witness a classic darting showdown. Scott "Shaggy" Williams sent shockwaves with his unforgettable run to the 2024 PDC World Championship Semi-Finals, and stunning nine-dart perfection.`
const MANLY = BOND.replace('Tonight', 'Today').replace('Bondi', 'Manly')

test('oztix categories become genre labels, including a band', () => {
  assert.deepEqual(oztixGenreLabels(['Sports'], []), ['Sports'])
  assert.deepEqual(oztixGenreLabels([{ Name: 'Comedy' }, 'Australian Artists'], [{ name: 'The Band' }]), ['Comedy', 'Australian Artists', 'Music'])
  assert.deepEqual(oztixGenreLabels('Sports', []), [])
})

test('sydney international darts cup is sports and never running', () => {
  for (const [title, description] of [
    ['SYDNEY INTERNATIONAL DARTS CUP - England v Oz at Bondi!', BOND],
    ['SYDNEY INTERNATIONAL DARTS CUP - England v Oz at Manly!', MANLY],
  ] as const) {
    const labelled = classifyOztixListing(title, description, ['Sports'])
    assert.equal(labelled.category, 'Sports')
    assert.equal(labelled.subTags.includes('Running'), false)
  }
  const stored = refineStoredCategory({
    title: 'SYDNEY INTERNATIONAL DARTS CUP - England v Oz at Bondi!',
    description: BOND,
    category: 'Sports',
    subTags: ['Running'],
  })
  assert.equal(stored?.category, 'Sports')
  assert.equal(stored?.subTags.includes('Running'), false)
  const fromGenre = classifyOztixListing('Sydney International Darts Cup', 'PDC darts at the oche', ['Running'])
  assert.equal(fromGenre.category, 'Sports')
  assert.equal(fromGenre.subTags.includes('Running'), false)
})

test('other oztix samples keep the shared classifier guards', () => {
  const comedy = classifyOztixListing('Basement Comedy Club: Friday Comedy Showcase', 'A night of stand-up comedy', ['Comedy'])
  assert.equal(comedy.category, 'Arts & Culture')
  assert.equal(comedy.subTags.includes('Comedy'), true)
  assert.equal(comedy.subTags.includes('Running'), false)

  const pop = classifyOztixListing('Hindley Street Country Club live in Townsville', 'A live pop show', ['Music', 'POP'])
  assert.equal(pop.category, 'Music')
  assert.equal(pop.subTags.includes('Pop'), true)
  assert.equal(pop.subTags.includes('Running'), false)

  const tribute = classifyOztixListing('Running in the Shadows of Fleetwood Mac', 'A Fleetwood Mac tribute', ['Music', 'Festivals', 'Tribute'])
  assert.equal(tribute.category, 'Music')
  assert.equal(tribute.subTags.includes('Running'), false)

  const marathon = classifyOztixListing(
    '34th Annual 2027 Lake Charlegrark Country Music Marathon',
    'A weekend of country music and camping',
    ['Family', 'Music', 'Festivals', 'Country', 'Acoustic'],
  )
  assert.equal(marathon.category, 'Music')
  assert.equal(marathon.subTags.includes('Country'), true)
  assert.equal(marathon.subTags.includes('Running'), false)

  const drag = classifyOztixListing(
    'Bangers & Mash - Nostalgia Drag Racing',
    'Nitro Funny Cars running to either NHRA rules. A run with a red light will not be eligible.',
    ['Sports'],
  )
  assert.equal(drag.category, 'Sports')
  assert.equal(drag.subTags.includes('Running'), false)

  const openMic = refineStoredCategory({
    title: 'The Dojo Open Mic',
    description: 'Melbourne hip hop open mic night running monthly at The Tote.',
    category: 'Sports',
    subTags: ['Running'],
  })
  assert.notEqual(openMic?.category, 'Sports')
  assert.equal(openMic?.subTags.includes('Running'), false)

  const run = classifyOztixListing('Sunrise run club', 'A 5km running session in the park', ['Sports'])
  assert.equal(run.category, 'Sports')
  assert.equal(run.subTags.includes('Running'), true)
})
