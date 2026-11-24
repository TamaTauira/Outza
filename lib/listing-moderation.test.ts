import assert from 'node:assert/strict'
import test from 'node:test'
import { fakePublicUrl, isRally, junkTitle, listingModeration, statusFromTitle } from './listing-moderation'

test('junk titles are hidden and a real title is not', () => {
  assert.equal(junkTitle('test test test'), true)
  assert.equal(junkTitle('[Test]Weekend Paws'), true)
  assert.equal(junkTitle('BOND shoot: Bond girl [Model pending]'), true)
  assert.equal(junkTitle('Jazz at the Enmore'), false)
})

test('a protest or a violent description stays in review', () => {
  assert.equal(isRally('Genocide Protest Every Single Day'), true)
  assert.equal(listingModeration('Town hall meeting', 'Bring Nylon Cable Ties to restrain and arrest people').moderationStatus, 'review')
  assert.equal(listingModeration('Jazz at the Enmore', 'Doors at 7. A full band, two sets, and the bar stays open after.').hidden, false)
})

test('ordinary classes and a cooking demonstration are not held as rallies', () => {
  assert.equal(isRally('Kids pottery wheel classes', 'A wheel, clay, and a quiet room for beginners.'), false)
  assert.equal(listingModeration('Tavern Trivia', 'Teams of four, questions from 7, and the kitchen stays open.').moderationStatus, 'approved')
  assert.equal(listingModeration('Kids pottery wheel classes', 'Two hours at the wheel with clay, aprons, and a kiln firing the next week.').hidden, false)
  assert.equal(isRally('Saturday cooking demonstration', 'A chef shows the sauce, then the room eats.'), false)
  assert.equal(isRally('Street demonstration against the mine'), true)
})

test('a status word in the title becomes the stored status', () => {
  assert.equal(statusFromTitle('Friday gig CANCELLED'), 'CANCELLED')
  assert.equal(statusFromTitle('Market postponed'), 'POSTPONED')
  assert.equal(statusFromTitle('Show sold out'), 'SOLD_OUT')
  assert.equal(statusFromTitle('Friday gig'), null)
})

test('training and networking titles stay off the public board on the next ingest', () => {
  assert.equal(listingModeration('BNI CBD breakfast', 'A long enough networking breakfast for the room.').hidden, true)
  assert.equal(listingModeration('Regus 1-day training', 'A full day course with a workbook and lunch included.').hidden, true)
  assert.equal(listingModeration('Jazz at the Enmore', 'Doors at 7. A full band, two sets, and the bar stays open after.').hidden, false)
})

test('example and picsum hosts are not public listing links', () => {
  assert.equal(fakePublicUrl('https://example.com/tickets/pride-nights'), true)
  assert.equal(fakePublicUrl('https://picsum.photos/seed/x/800'), true)
  assert.equal(fakePublicUrl('https://events.humanitix.com/run-club'), false)
})
