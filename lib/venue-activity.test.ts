import assert from 'node:assert/strict'
import test from 'node:test'
import { nearbyDemand, shapeVenueActivity } from './venue-activity'

test('venue activity uses stored counts and hides small home areas', () => {
  const view = shapeVenueActivity({
    views: 40,
    saves: 3,
    itineraryAdds: 2,
    ticketClicks: 5,
    nights: [{ dow: 5, views: 22 }, { dow: 6, views: 11 }, { dow: 1, views: 0 }],
    categories: [{ category: 'Music', views: 30 }, { category: 'Comedy', views: 4 }],
    people: [
      { postcode: '2037', birthYear: 1990, people: 12 },
      { postcode: '2042', birthYear: 1992, people: 3 },
      { postcode: '2060', birthYear: 1991, people: 4 },
      { postcode: '2000', birthYear: 2015, people: 20 },
    ],
    now: new Date('2026-11-19T00:00:00.000Z'),
  })
  assert.equal(view.views, 40)
  assert.equal(view.saves, 3)
  assert.deepEqual(view.bestNights.map((row) => row.label), ['Friday', 'Saturday'])
  assert.equal(view.areas.length, 1)
  assert.equal(view.areas[0].label, 'Inner west')
  assert.equal(view.areas[0].people, 15)
  assert.equal(view.hiddenAreas >= 1, true)
  assert.doesNotMatch(JSON.stringify(view), /Outza/)
})

test('nearby demand names clashes and gaps from the rows it is given', () => {
  const pin = nearbyDemand({
    lat: -33.89,
    lng: 151.2,
    dates: ['2026-11-21', '2026-11-22'],
    others: [
      { id: 'a', title: 'Late set', date: '2026-11-21', time: '21:00', venueName: 'Next Door', category: 'Music', lat: -33.891, lng: 151.201 },
      { id: 'b', title: 'Far show', date: '2026-11-21', time: '20:00', venueName: 'Across town', category: 'Music', lat: -33.7, lng: 151.0 },
    ],
  })
  assert.equal(pin.nights[0].events.length, 1)
  assert.equal(pin.nights[0].events[0].title, 'Late set')
  assert.equal(pin.nights[1].gap, true)
  assert.match(pin.basis, /3 km/)
  const city = nearbyDemand({ lat: null, lng: null, dates: ['2026-11-21'], others: pin.nights[0].events.concat([{ id: 'b', title: 'Far show', date: '2026-11-21', time: '20:00', venueName: 'Across town', category: 'Music', lat: -33.7, lng: 151.0 }]) })
  assert.equal(city.nights[0].events.length, 2)
  assert.match(city.basis, /no pin/)
})
