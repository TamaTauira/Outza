import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { formatBoardRange } from './listing-window'
import { listClockLabel, listPlaceLine } from '../components/list-clock'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const row = readFileSync(new URL('../components/board-row.tsx', import.meta.url), 'utf8')
const card = readFileSync(new URL('../components/listing-board-card.tsx', import.meta.url), 'utf8')

test('the mobile list row is one fixed height and each line is clamped', () => {
  assert.match(css, /--vp-list-row-h:\s*92px/)
  assert.match(css, /\.vp-mrow\s*\{[^}]*height:\s*var\(--vp-list-row-h\)/)
  assert.match(css, /\.vp-mrow\s*\{[^}]*max-height:\s*var\(--vp-list-row-h\)/)
  assert.match(css, /\.vp-mrow\s*\{[^}]*overflow:\s*hidden/)
  assert.match(css, /\.vp-mrow-title,\s*\.vp-mrow-venue,\s*\.vp-mrow-venue-inline\s*\{[^}]*white-space:\s*nowrap/)
  assert.match(css, /\.vp-mrow-title,\s*\.vp-mrow-venue,\s*\.vp-mrow-venue-inline\s*\{[^}]*text-overflow:\s*ellipsis/)
  assert.match(css, /\.vp-board-title,\s*\.vp-board-venue\s*\{[^}]*white-space:\s*nowrap/)
  assert.match(css, /\.vp-board-title,\s*\.vp-board-venue\s*\{[^}]*text-overflow:\s*ellipsis/)
  assert.match(css, /\.vp-board-body\s*\{[^}]*max-height:\s*114px/)
  assert.match(css, /\.vp-clock\s*\{[^}]*font-variant-numeric:\s*tabular-nums/)
  assert.match(css, /\.vp-clock-hm\s*\{[^}]*text-align:\s*right/)
  assert.match(row, /data-vp-row="list"/)
  assert.match(row, /vp-mrow-title/)
  assert.match(row, /className="vp-mrow-venue"/)
  assert.match(card, /vp-board-title/)
  assert.match(card, /data-vp-card="board"/)
})

test('a finish is spoken with to, and the place line stays one field', () => {
  const when = formatBoardRange({ date: '2026-11-24', time: '10:00', endTime: '10:40' })
  const label = listClockLabel(when)
  assert.equal(label, '10:00 am to 10:40 am')
  assert.equal(/until/i.test(label), false)
  assert.equal(listPlaceLine('The Hall · Newtown', null), 'The Hall · Newtown')
  assert.equal(listPlaceLine('The Hall · Newtown', '+1'), 'The Hall · Newtown')
  assert.equal(listPlaceLine('The Hall · Newtown', '2 Nov'), 'The Hall · Newtown · 2 Nov')
})
