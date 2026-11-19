import assert from 'node:assert/strict'
import test from 'node:test'
import { venueMonthlyLetter } from './venue-monthly'

test('the monthly venue note uses the numbers it is given and can be turned off', () => {
  const letter = venueMonthlyLetter({
    greeting: 'Ada',
    unsubUrl: 'https://vibepeep.test/unsubscribe/venue?u=1&k=2',
    venues: [{ name: 'The Lantern', followers: 4, views: 12, saves: 0, itineraryAdds: null, ticketClicks: 3 }],
  })
  assert.match(letter.text, /The Lantern/)
  assert.match(letter.text, /views 12/)
  assert.match(letter.text, /saves 0/)
  assert.match(letter.text, /itinerary adds Not loaded/)
  assert.match(letter.text, /ticket clicks 3/)
  assert.match(letter.text, /followers 4/)
  assert.match(letter.html, /Turn off this monthly note/)
  assert.doesNotMatch(letter.text, /Outza/i)
  assert.match(letter.html, /VibePeep/)
})
