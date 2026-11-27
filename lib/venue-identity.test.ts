import assert from 'node:assert/strict'
import test from 'node:test'
import { conflictingRooms, resolveVenueIdentity, sameVenueIdentity } from './venue-identity'

test('renamed arenas are one venue and TikTok Entertainment Centre is not that arena', () => {
  const afterpay = resolveVenueIdentity('Afterpay Arena', 'Sydney')
  const qudos = resolveVenueIdentity('Qudos Bank Arena', 'Sydney')
  const superdome = resolveVenueIdentity('Sydney SuperDome', 'Sydney')
  const tiktok = resolveVenueIdentity('TikTok Entertainment Centre', 'Sydney')
  assert.equal(afterpay?.id, 'afterpay-arena')
  assert.equal(sameVenueIdentity(afterpay, qudos), true)
  assert.equal(sameVenueIdentity(afterpay, superdome), true)
  assert.equal(sameVenueIdentity(afterpay, tiktok), false)
  assert.equal(tiktok?.id, 'tiktok-entertainment-centre')
})

test('stadium aliases do not collapse neighbouring venues', () => {
  const accor = resolveVenueIdentity('ANZ Stadium', 'Sydney')
  const allianz = resolveVenueIdentity('Sydney Football Stadium', 'Sydney')
  const scg = resolveVenueIdentity('SCG', 'Sydney')
  const commbank = resolveVenueIdentity('Bankwest Stadium', 'Sydney')
  const winStadium = resolveVenueIdentity('WIN Stadium', 'Wollongong')
  const winCentre = resolveVenueIdentity('WIN Entertainment Centre', 'Wollongong')
  assert.equal(accor?.id, 'accor-stadium')
  assert.equal(allianz?.id, 'allianz-stadium')
  assert.equal(scg?.id, 'scg')
  assert.equal(commbank?.id, 'commbank-stadium')
  assert.equal(winStadium?.id, 'win-stadium')
  assert.equal(winCentre?.id, 'win-entertainment-centre')
  assert.equal(resolveVenueIdentity('Wollongong Stadium', 'Wollongong')?.id, 'win-stadium')
  assert.equal(resolveVenueIdentity('WIN Stadium', 'Sydney'), null)
  assert.equal(sameVenueIdentity(allianz, scg), false)
  assert.equal(sameVenueIdentity(winStadium, winCentre), false)
})

test('opera house rooms stay distinct and State Theatre is Sydney-only', () => {
  const concert = resolveVenueIdentity('Sydney Opera House Concert Hall', 'Sydney')
  const drama = resolveVenueIdentity('Sydney Opera House, Drama Theatre', 'Sydney')
  assert.equal(concert?.id, 'sydney-opera-house')
  assert.equal(drama?.id, 'sydney-opera-house')
  assert.equal(conflictingRooms(concert, drama), true)
  assert.equal(sameVenueIdentity(concert, drama), false)
  assert.equal(resolveVenueIdentity('State Theatre', 'Sydney')?.id, 'state-theatre-sydney')
  assert.equal(resolveVenueIdentity('State Theatre', 'Melbourne'), null)
})

test('Enmore and Factory are different venues', () => {
  const enmore = resolveVenueIdentity('The Enmore Theatre', 'Sydney')
  const factory = resolveVenueIdentity('Factory Theatre', 'Sydney')
  assert.equal(enmore?.id, 'enmore-theatre')
  assert.equal(factory?.id, 'factory-theatre')
  assert.equal(sameVenueIdentity(enmore, factory), false)
})

test('Opera House steps and ICC rooms resolve without swallowing a different centre', () => {
  assert.equal(resolveVenueIdentity('Steps of Sydney Opera House', 'Sydney')?.id, 'sydney-opera-house')
  assert.equal(resolveVenueIdentity('On The Steps at Sydney Opera House Forecourt', 'Sydney')?.id, 'sydney-opera-house')
  assert.equal(resolveVenueIdentity('ICC Sydney - Grand Ballroom', 'Sydney')?.id, 'icc-sydney')
  assert.equal(resolveVenueIdentity('Grand Ballroom, ICC Sydney', 'Sydney')?.id, 'icc-sydney')
  assert.equal(resolveVenueIdentity('ICC Sydney. Level 4 Foyer, outside Room 4.5', 'Sydney')?.id, 'icc-sydney')
  assert.equal(resolveVenueIdentity('Royal International Convention Centre', 'Brisbane'), null)
  assert.equal(resolveVenueIdentity('Royal International Convention Centre', 'Sydney'), null)
  assert.equal(
    sameVenueIdentity(
      resolveVenueIdentity('ICC Sydney', 'Sydney'),
      resolveVenueIdentity('TikTok Entertainment Centre', 'Sydney'),
    ),
    false,
  )
})

test('Newcastle stadium keeps its former names', () => {
  const current = resolveVenueIdentity('McDonald Jones Stadium', 'Newcastle')
  const former = resolveVenueIdentity('Hunter Stadium', 'Newcastle')
  assert.equal(sameVenueIdentity(current, former), true)
  assert.equal(resolveVenueIdentity('Hunter Stadium', 'Sydney'), null)
})
