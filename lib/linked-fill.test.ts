import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decideDuplicate } from './event-identity'
import {
  classifyDonor,
  fieldSourcesFromRecords,
  filledSourceNote,
  guardAgainstWeakerSource,
  planLinkedFill,
  plansForRows,
  reliablePrice,
  type FillEvent,
} from './linked-fill'

const COURTNEY_ID = 'cmvkt4inf01pkp9mo52wgev7m'
const TICKETMASTER_ID = 'cmw1cui2e03exjp0746qse7dn'

function frontier(partial: Partial<FillEvent> = {}): FillEvent {
  return {
    id: COURTNEY_ID,
    title: 'Courtney Barnett',
    venueName: 'The Tivoli',
    venueAddress: 'The Tivoli, Brisbane',
    city: 'Brisbane',
    date: '2026-11-04',
    time: null,
    endTime: null,
    price: null,
    priceMin: null,
    priceMax: null,
    isFree: false,
    source: 'frontier',
    sources: ['frontier', 'ticketmaster'],
    ticketUrl: 'https://frontiertouringcom.coredna.site/courtneybarnett',
    description: 'Courtney Barnett 2026 live in Brisbane, presented by Frontier Touring.',
    imageUrl: 'https://example.com/frontier.jpg',
    latitude: null,
    longitude: null,
    ...partial,
  }
}

function ticketmaster(partial: Partial<FillEvent> = {}): FillEvent {
  return {
    id: TICKETMASTER_ID,
    title: 'Courtney Barnett - Creature of Habit Tour',
    venueName: 'The Tivoli',
    venueAddress: '52 Costin St, Brisbane',
    city: 'Brisbane',
    date: '2026-11-04',
    time: '19:00',
    endTime: null,
    price: null,
    priceMin: null,
    priceMax: null,
    isFree: false,
    source: 'ticketmaster',
    sources: ['ticketmaster'],
    ticketUrl: 'https://www.ticketmaster.com.au/courtney-barnett-creature-of-habit-tour-brisbane-04-11-2026/event/1300647BE6FDADD4',
    description: 'Approximate Running Times: Doors - 7:00pm Start - TBC Finish - TBC .',
    latitude: -27.45233,
    longitude: 153.03154,
    imageUrl: 'https://s1.ticketm.net/dam/c/example_TABLET_LANDSCAPE_LARGE_16_9.jpg',
    ...partial,
  }
}

test('Courtney Barnett at The Tivoli copies Ticketmaster time, street and pin, and does not invent a price', () => {
  const canonical = frontier()
  const copy = ticketmaster()
  assert.equal(classifyDonor(canonical, copy), 'attributed')
  const plan = planLinkedFill(canonical, [copy])
  assert.equal(plan.patch.time, '19:00')
  assert.equal(plan.patch.endTime, undefined)
  assert.equal(plan.patch.price, undefined)
  assert.equal(plan.patch.venueAddress, '52 Costin St, Brisbane')
  assert.equal(plan.patch.latitude, -27.45233)
  assert.equal(plan.patch.longitude, 153.03154)
  assert.equal(plan.patch.ticketUrl, undefined)
  assert.equal(plan.patch.description, undefined)
  assert.equal(plan.patch.allDay, false)
  assert.equal(plan.patch.timezone, 'Australia/Brisbane')
  assert.equal((plan.patch.startsAt as Date).toISOString(), '2026-11-04T09:00:00.000Z')
  assert.equal(plan.patch.endsAt, null)
  assert.equal(plan.filled.find((row) => row.field === 'time')?.source, 'ticketmaster')
  assert.equal(plan.filled.find((row) => row.field === 'venueAddress')?.source, 'ticketmaster')
  const again = planLinkedFill({ ...canonical, ...plan.patch, date: '2026-11-04' }, [copy])
  assert.equal(again.filled.length, 0)
})

test('a Ticketmaster price and finish time fill the same Courtney Barnett gap', () => {
  const plan = planLinkedFill(frontier(), [ticketmaster({ endTime: '22:30', price: '$89.90', priceMin: 89.9, priceMax: 89.9 })])
  assert.equal(plan.patch.time, '19:00')
  assert.equal(plan.patch.endTime, '22:30')
  assert.equal(plan.patch.price, '$89.90')
  assert.equal(plan.patch.isFree, false)
  assert.equal(plan.patch.priceMin, 89.9)
  assert.equal(plan.patch.priceMax, 89.9)
  assert.equal((plan.patch.startsAt as Date).toISOString(), '2026-11-04T09:00:00.000Z')
  assert.equal((plan.patch.endsAt as Date).toISOString(), '2026-11-04T12:30:00.000Z')
  for (const field of ['time', 'endTime', 'price']) {
    assert.equal(plan.filled.find((row) => row.field === field)?.source, 'ticketmaster')
  }
  const note = filledSourceNote('frontier', fieldSourcesFromRecords([
    { source: 'ticketmaster', contributed: { time: true, endTime: true, price: true, priceMin: true, isFree: true } },
  ], 'frontier'))
  assert.match(note ?? '', /start time, the finish time and the price were filled from Ticketmaster/i)
  assert.match(note ?? '', /original listing left them blank/)
  assert.doesNotMatch(note ?? '', /verified/i)
  assert.doesNotMatch(note ?? '', /Frontier/)
})

test('the Melbourne Palais listing is not used to fill the Brisbane-labelled Tivoli row', () => {
  const melbourne = frontier({
    id: 'cmvkt4inb01pjp9moymirrqny',
    city: 'Melbourne',
    date: '2026-11-07',
    venueName: 'The Tivoli',
    venueAddress: 'The Tivoli, Brisbane',
  })
  const palais = ticketmaster({
    id: 'cmw1ctdlp0208jp07yi2sqwui',
    city: 'Melbourne',
    date: '2026-11-07',
    title: 'Courtney Barnett - Creature of Habit Tour',
    venueName: 'Palais Theatre',
    venueAddress: 'Lower Esplanade, St Kilda',
    time: '20:00',
    price: '$120',
    latitude: -37.8676,
    longitude: 144.976,
  })
  assert.equal(classifyDonor(melbourne, palais), 'reject')
  assert.equal(planLinkedFill(melbourne, [palais]).filled.length, 0)
})

test('a street used as the venue name is filled from the named rooms, and a real name is kept', () => {
  const street = frontier({
    title: 'Slice of the Point',
    venueName: 'Llankelly Pl',
    venueAddress: 'Llankelly Pl, Potts Point NSW 2011',
    price: null,
  })
  const rooms = ticketmaster({
    title: 'Slice of the Point',
    venueName: 'PIÑA, Room Ten and Dear Sainte Éloise',
    venueAddress: 'Llankelly Pl, Potts Point NSW 2011',
    price: '$50',
    priceMin: 50,
    priceMax: 50,
    relation: 'linked',
  })
  const plan = planLinkedFill(street, [rooms])
  assert.equal(plan.patch.venueName, 'PIÑA, Room Ten and Dear Sainte Éloise')
  assert.equal(plan.patch.price, '$50')
  assert.equal(plan.filled.find((row) => row.field === 'venueName')?.source, 'ticketmaster')

  const named = planLinkedFill(frontier({ venueName: 'Cardea Barangaroo' }), [ticketmaster({ venueName: 'Somewhere Else', relation: 'linked' })])
  assert.equal(named.patch.venueName, undefined)
})

test('a review pair is not a donor, even when the listing already names that source', () => {
  const canonical = frontier({ time: '19:00', price: null })
  const donor = ticketmaster({ time: '19:00', price: '$89.90', priceMin: 89.9, priceMax: 89.9 })
  const decision = decideDuplicate(
    { title: canonical.title, venueName: canonical.venueName, city: canonical.city, date: '2026-11-04', time: '19:00', source: 'frontier' },
    { title: donor.title, venueName: donor.venueName, city: donor.city, date: '2026-11-04', time: '19:00', source: 'ticketmaster' },
  )
  assert.equal(decision.action, 'review')
  assert.equal(classifyDonor(canonical, donor), 'review')
  const plan = planLinkedFill(canonical, [donor])
  assert.equal(plan.filled.length, 0)
  assert.equal(plan.skippedReview, 1)
  assert.equal(plan.patch.price, undefined)
})

test('an already linked copy still fills gaps, and a present time is not replaced', () => {
  const canonical = frontier({ time: '20:00', price: 'TBA', sources: ['frontier'] })
  const donor = ticketmaster({ duplicateOfId: COURTNEY_ID, time: '19:00', endTime: '22:00', price: '$70' })
  assert.equal(classifyDonor(canonical, donor), 'linked')
  const plan = planLinkedFill(canonical, [donor])
  assert.equal(plan.patch.time, undefined)
  assert.equal(plan.patch.endTime, '22:00')
  assert.equal(plan.patch.price, '$70')
  assert.equal(reliablePrice({ price: 'TBA', isFree: false }), null)
})

test('ticketing price and times beat a council copy, and a free listing is not overwritten', () => {
  const canonical = frontier({ sources: ['frontier', 'ticketmaster', 'cityofsydney'], venueAddress: null })
  const council: FillEvent = {
    id: 'council',
    title: 'Courtney Barnett',
    venueName: 'The Tivoli',
    city: 'Brisbane',
    date: '2026-11-04',
    time: '18:00',
    endTime: '21:00',
    price: null,
    isFree: false,
    source: 'cityofsydney',
    relation: 'linked',
    duplicateOfId: COURTNEY_ID,
    venueAddress: '52 Costin Street, Fortitude Valley QLD 4006',
    latitude: -27.452,
    longitude: 153.032,
  }
  const priced = ticketmaster({ time: '19:30', endTime: '22:15', price: '$50', priceMin: 50, priceMax: 80 })
  const plan = planLinkedFill(canonical, [council, priced])
  assert.equal(plan.patch.time, '19:30')
  assert.equal(plan.patch.endTime, '22:15')
  assert.equal(plan.patch.price, '$50')
  assert.equal(plan.filled.find((row) => row.field === 'time')?.source, 'ticketmaster')
  assert.equal(plan.filled.find((row) => row.field === 'venueAddress')?.source, 'cityofsydney')
  assert.equal(plan.patch.latitude, -27.452)
  const free = planLinkedFill(frontier({ isFree: true, price: 'Free', priceMin: 0, priceMax: 0, time: '19:00' }), [priced])
  assert.equal(free.patch.price, undefined)
  assert.equal(free.patch.time, undefined)
})

test('organiser edits, locked fields and a locked image are left alone', () => {
  const donor = ticketmaster({ price: '$40', description: 'A long enough biography of the show to be worth keeping on the listing.' })
  assert.equal(planLinkedFill(frontier({ organiserEditedAt: '2026-11-01' }), [donor]).filled.length, 0)
  const locked = planLinkedFill(frontier({
    description: '',
    imageUrl: null,
    imageLocked: true,
    lockedFields: ['time', 'price'],
  }), [donor])
  assert.equal(locked.patch.time, undefined)
  assert.equal(locked.patch.price, undefined)
  assert.equal(locked.patch.imageUrl, undefined)
  assert.match(String(locked.patch.description), /biography/)
})

test('unlinked tour wording without a named source does not fill', () => {
  const canonical = frontier({ sources: ['frontier'], time: null, price: null })
  const donor = ticketmaster({ price: '$89.90' })
  assert.notEqual(classifyDonor(canonical, donor), 'linked')
  assert.notEqual(classifyDonor(canonical, donor), 'attributed')
  assert.equal(planLinkedFill(canonical, [donor]).filled.length, 0)
})

test('plansForRows fills the canonical Courtney listing from the same-day Ticketmaster row', () => {
  const rows = plansForRows([frontier(), ticketmaster({ price: '$89.90', priceMin: 89.9, priceMax: 89.9, endTime: '22:30' })])
  const courtney = rows.find((row) => row.event.id === COURTNEY_ID)
  assert.ok(courtney)
  assert.equal(courtney?.skip, null)
  assert.equal(courtney?.plan.patch.time, '19:00')
  assert.equal(courtney?.plan.patch.price, '$89.90')
  assert.equal(rows.some((row) => row.event.id === TICKETMASTER_ID), false)
})

test('a source refresh cannot clear a filled time, price or street with a blank', () => {
  const existing = {
    date: '2026-11-04',
    city: 'Brisbane',
    source: 'frontier',
    title: 'Courtney Barnett',
    venueName: 'The Tivoli',
    time: '19:00',
    endTime: '22:30',
    price: '$89.90',
    priceMin: 89.9,
    priceMax: 89.9,
    isFree: false,
    venueAddress: '52 Costin St, Brisbane',
    latitude: -27.45233,
    longitude: 153.03154,
    description: 'Courtney Barnett 2026 live in Brisbane, presented by Frontier Touring.',
  }
  const guarded = guardAgainstWeakerSource(existing, {
    time: null,
    endTime: null,
    price: null,
    priceMin: null,
    priceMax: null,
    isFree: false,
    venueAddress: 'The Tivoli, Brisbane',
    description: '',
    allDay: true,
    latitude: null,
    longitude: null,
  })
  assert.equal('time' in guarded, false)
  assert.equal('price' in guarded, false)
  assert.equal('venueAddress' in guarded, false)
  assert.equal('description' in guarded, false)
  assert.equal(guarded.allDay, false)
  assert.equal((guarded.startsAt as Date).toISOString(), '2026-11-04T09:00:00.000Z')
  const replaced = guardAgainstWeakerSource(existing, { time: '20:00', endTime: '23:00', price: '$95', priceMin: 95, priceMax: 95, isFree: false })
  assert.equal(replaced.time, '20:00')
  assert.equal(replaced.price, '$95')
})
