import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildTranscript, personaliseItems, selectEdition, spokenScript, type BriefingCandidate } from './daily-briefing'

const now = Date.parse('2026-11-03T02:00:00.000Z')
const day = '2026-11-03'

function event(over: Partial<BriefingCandidate> & { id: string }): BriefingCandidate {
  return {
    title: over.title ?? over.id,
    description: 'The listing description.',
    date: '2026-11-03T00:00:00.000Z',
    endDate: null,
    time: '19:30',
    endTime: '21:30',
    venueName: 'The Lantern',
    suburb: 'Newtown',
    city: 'Sydney',
    category: 'Music',
    isFree: false,
    price: '$20',
    status: 'SCHEDULED',
    duplicateOfId: null,
    lastVerifiedAt: '2026-11-02T00:00:00.000Z',
    updatedAt: '2026-11-02T00:00:00.000Z',
    source: 'humanitix',
    ...over,
  }
}

test('briefings keep fresh listings and drop stale, cancelled and untimed tonight guesses', () => {
  const rows = [
    event({ id: 'tonight' }),
    event({ id: 'stale', lastVerifiedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }),
    event({ id: 'off', status: 'CANCELLED' }),
    event({ id: 'untimed', time: null, title: 'Maybe later' }),
    event({ id: 'saturday', date: '2026-11-07T00:00:00.000Z', time: '11:00' }),
  ]
  const tonight = selectEdition(rows, 'tonight', day, 12 * 60, now).map((row) => row.id)
  assert.deepEqual(tonight, ['tonight'])
  const weekend = selectEdition(rows, 'weekend', day, 12 * 60, now).map((row) => row.id)
  assert.deepEqual(weekend, ['saturday'])
  const transcript = buildTranscript(rows, 'tonight', 'Sydney', day, 12 * 60, now)
  const text = spokenScript(transcript)
  assert.match(text, /Listed price: \$20/)
  assert.doesNotMatch(text, /sold out|attendees|Maybe later|stale/i)
  assert.match(transcript.items[0]?.path ?? '', /harbour|tonight|events\//i)
})

test('personalisation reorders from saved preferences and leaves the spoken list alone', () => {
  const music = event({ id: 'music', category: 'Music', time: '20:00' })
  const market = event({ id: 'market', category: 'Community', title: 'Market', time: '18:00' })
  const transcript = buildTranscript([market, music], 'tonight', 'Sydney', day, 12 * 60, now)
  assert.deepEqual(transcript.items.map((item) => item.id), ['market', 'music'])
  const personal = personaliseItems(transcript.items, [market, music], {
    name: 'Ada',
    city: 'Sydney',
    preferredCategories: ['Music'],
    venueNames: [],
    saved: [],
  })
  assert.equal(personal.personalised, true)
  assert.equal(personal.items[0]?.id, 'music')
  assert.match(personal.items[0]?.note ?? '', /Music/)
  assert.equal(personal.items[1]?.note, null)
  const spoken = spokenScript(transcript)
  assert.ok(spoken.indexOf('Market') < spoken.indexOf(music.title))
  assert.deepEqual(transcript.items.map((item) => item.id), ['market', 'music'])
})
