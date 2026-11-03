import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildEventInsight, insightMatch, rewriteIsGrounded } from './event-insight'

const facts = {
  title: 'Harbour Jazz',
  category: 'Music',
  city: 'Sydney',
  venueName: 'The Lantern',
  dateLabel: 'Saturday 7 November',
  time: '19:00',
  isFree: false,
  price: '$25',
  description: 'A quartet plays two sets.',
  accessibilityInfo: null,
  ageRestriction: '18+',
  transportInfo: null,
  relatedTitles: ['Late Set'],
  source: 'humanitix',
  sourceUrl: 'https://events.humanitix.com/harbour-jazz',
  lastChecked: '2026-11-02T00:00:00.000Z',
  organiserUpdated: true,
}

test('the summary uses only listing fields and labels each source', () => {
  const insight = buildEventInsight(facts)
  assert.ok(insight)
  assert.match(insight!.sentences.join(' '), /Harbour Jazz/)
  assert.match(insight!.sentences.join(' '), /\$25/)
  assert.match(insight!.sentences.join(' '), /A quartet plays two sets/)
  assert.match(insight!.disclaimer, /not an attendee review/)
  assert.equal(insight!.sources.some((source) => source.kind === 'organiser' && source.label === 'Updated by organiser'), true)
  assert.equal(insight!.sources.some((source) => source.label.includes('Humanitix')), true)
  assert.doesNotMatch(JSON.stringify(insight), /verified/i)
})

test('a preference line appears only for preferences that were supplied', () => {
  assert.equal(insightMatch(facts, null), null)
  assert.equal(insightMatch(facts, {}), null)
  const line = insightMatch(facts, { preferredCategories: ['Music'], homeCity: 'Sydney', savedInCategory: 2 })
  assert.match(line ?? '', /you follow Music/)
  assert.match(line ?? '', /your home city is Sydney/)
  assert.match(line ?? '', /saved similar events/)
  assert.doesNotMatch(line ?? '', /peep|viewed/i)
})

test('a stale curated note is left out and a current one can be quoted', () => {
  const asOfFacts = facts
  const asOf = new Date('2026-11-03T00:00:00.000Z')
  const hidden = buildEventInsight(asOfFacts, null, {
    note: 'This room is on Oxford Street.',
    lastVerified: '2020-01-01',
    sourceUrl: 'https://example.com/old',
  }, null, asOf)
  assert.doesNotMatch(hidden!.sentences.join(' '), /Oxford Street/)
  const shown = buildEventInsight(asOfFacts, null, {
    note: 'The guide still prints a festival insert.',
    lastVerified: '2026-11-01',
    sourceUrl: 'https://example.com/guide',
  }, null, asOf)
  assert.match(shown!.sentences.join(' '), /festival insert/)
})

test('an AI rewrite that adds a price or a review is rejected', () => {
  const allowed = 'Harbour Jazz is listed as Music. The listed price is $25.'
  assert.equal(rewriteIsGrounded('Harbour Jazz is a music listing. The listed price is $25.', allowed), true)
  assert.equal(rewriteIsGrounded('Tickets are $40 and attendees loved it.', allowed), false)
  assert.equal(rewriteIsGrounded('Only 12 tickets remain.', allowed), false)
})
