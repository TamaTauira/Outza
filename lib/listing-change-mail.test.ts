import assert from 'node:assert/strict'
import test from 'node:test'
import { emailClock, emailDay, uniqueRecipients } from './listing-change-mail'

test('cancelled mail goes to savers and itinerary adders once each', () => {
  const people = uniqueRecipients([
    { userId: 'a', email: 'Sam@Example.com', name: 'Sam' },
    { userId: 'a', email: 'sam@example.com', name: 'Sam' },
    { userId: 'b', email: 'sam@example.com', name: 'Also Sam' },
    { userId: 'c', email: 'outza-tester+qa-one@mail.grokbot.com', name: 'QA' },
    { userId: 'd', email: 'dee@example.com', name: 'Dee' },
  ])
  assert.deepEqual(people.map((row) => row.userId), ['a', 'd'])
  assert.equal(emailClock('19:30'), '7:30 pm')
  assert.equal(emailDay(new Date('2026-11-07T00:00:00.000Z')), 'Sat 7 Nov')
})
