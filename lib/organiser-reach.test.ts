import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  audienceShares,
  benchmarkSentence,
  bestTimeLine,
  clickRate,
  collapseHits,
  costPerClick,
  funnel,
  impressionSydneyDay,
  normalizeSearchTerm,
  parseReachRange,
  peakHour,
  peakWeekday,
  reachTips,
  recapFragment,
  returnEstimate,
  shiftDay,
  suppressSmall,
  sydneyInstant,
  toCsv,
} from './organiser-reach'

test('range stays inside 180 days and custom dates are kept', () => {
  const preset = parseReachRange({ range: '7' }, new Date('2026-11-10T00:00:00.000Z'))
  assert.equal(shiftDay(preset.to, -6), preset.from)
  const custom = parseReachRange({ range: 'custom', from: '2026-10-01', to: '2026-10-20' }, new Date('2026-11-10T00:00:00.000Z'))
  assert.deepEqual(custom, { from: '2026-10-01', to: '2026-10-20' })
  const huge = parseReachRange({ range: 'custom', from: '2020-01-01', to: '2026-11-10' })
  assert.equal(shiftDay(huge.from, 179), huge.to)
})

test('Sydney midnight in November is the previous UTC afternoon', () => {
  const start = sydneyInstant('2026-11-10')
  assert.equal(start.toISOString(), '2026-11-09T13:00:00.000Z')
})

test('search terms drop emails and tiny or odd strings', () => {
  assert.equal(normalizeSearchTerm('  Jazz  Night '), 'jazz night')
  assert.equal(normalizeSearchTerm('fan@venue.com'), null)
  assert.equal(normalizeSearchTerm('a'), null)
  assert.equal(normalizeSearchTerm('1234567'), null)
})

test('funnel shows the drop from seen to ticket clicks', () => {
  const stages = funnel([
    { label: 'Seen', value: 100 },
    { label: 'Opened', value: 40 },
    { label: 'Saved', value: 10 },
    { label: 'Get tickets', value: 4 },
  ])
  assert.equal(stages[1]?.share, 40)
  assert.equal(stages[3]?.step, 40)
  assert.equal(stages[3]?.value, 4)
})

test('benchmark needs a crowd and can say 2×', () => {
  assert.equal(benchmarkSentence({ clicks: 4, peerClicks: 16, peers: 7, category: 'Comedy', place: 'Newtown', basis: 'in this range' }), null)
  const line = benchmarkSentence({ clicks: 20, peerClicks: 80, peers: 8, category: 'Comedy', place: 'Newtown', basis: 'in this range' })
  assert.equal(line, 'Your Get tickets clicks are 2× the average for Comedy in Newtown (in this range).')
})

test('places under 10 stay hidden and audience shares use the groups that remain', () => {
  assert.deepEqual(suppressSmall([{ label: 'Newtown', count: 9 }, { label: 'Glebe', count: 12 }]).map((row) => row.label), ['Glebe'])
  const shares = audienceShares([{ label: 'Music', count: 30 }, { label: 'Jazz', count: 10 }, { label: 'Solo', count: 4 }])
  assert.equal(shares.find((row) => row.label === 'Solo'), undefined)
  assert.equal(shares[0]?.pct, 75)
})

test('spotlight maths and the return ceiling', () => {
  assert.equal(clickRate(25, 100), 25)
  assert.equal(costPerClick(4900, 10), 490)
  assert.equal(costPerClick(4900, 0), null)
  assert.equal(returnEstimate(4, 25), 10000)
  assert.equal(returnEstimate(4, 0), null)
})

test('best time and tips follow the numbers', () => {
  assert.equal(peakHour([{ hour: 19, count: 4 }, { hour: 11, count: 3 }]), null)
  assert.equal(peakHour([{ hour: 19, count: 8 }, { hour: 11, count: 3 }]), 19)
  assert.equal(peakWeekday([{ day: '2026-11-07', count: 12 }]), 'Saturday')
  assert.match(bestTimeLine('Saturday', 19) ?? '', /Saturday/)
  const tips = reachTips({
    showPrivate: true, hasImage: false, opened: 40, seen: 200, saves: 12, ticket: 1, reactions: 2,
    peakHour: 19, peakDay: 'Saturday', clashes: 4, shareLinks: 0, venue: false,
  })
  assert.match(tips.join(' '), /photo/i)
  assert.match(tips.join(' '), /7pm/)
  assert.match(tips.join(' '), /Instagram/)
  assert.equal(tips.some((tip) => /Outza/i.test(tip)), false)
})

test('hits collapse onto one Sydney day and spotlight buckets convert', () => {
  const rows = collapseHits([
    { name: 'seen', subjectId: 'e1', dim: 'board', count: 2, at: new Date('2026-11-10T02:00:00.000Z') },
    { name: 'seen', subjectId: 'e1', dim: 'board', count: 1, at: new Date('2026-11-10T03:00:00.000Z') },
  ], new Date('2026-11-10T02:00:00.000Z'))
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.count, 3)
  assert.equal(rows[0]?.day, '2026-11-10')
  const evening = impressionSydneyDay('2026-11-10T13')
  assert.equal(evening, '2026-11-11')
})

test('the weekly recap has an unsubscribe link and stays on the VibePeep name', () => {
  const mail = recapFragment({
    opened: 12, ticket: null, saves: 4, reactions: 3,
    tip: 'Add a photo.', benchmark: 'Your Get tickets clicks are 2× the average for Comedy in Newtown (in this range).',
    unsubUrl: 'https://vibepeep.example/unsubscribe/report?u=1&k=abc',
  })
  assert.match(mail.html, /Unsubscribe from these weekly recaps/)
  assert.match(mail.text, /https:\/\/vibepeep\.example\/unsubscribe\/report/)
  assert.match(mail.html, /Locked/)
  assert.equal(/Outza/i.test(mail.html + mail.text), false)
  const csv = toCsv(['event', 'note'], [['Jazz, late', 'say "hi"']])
  assert.match(csv, /"Jazz, late"/)
  assert.match(csv, /"say ""hi"""/)
})
