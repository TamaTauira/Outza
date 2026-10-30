import assert from 'node:assert/strict'
import { test } from 'node:test'
import { localToBoard, type LocalOccurrence } from './local-shared'

const full: LocalOccurrence = {
  id: 'abc',
  title: 'Sunday garage sale',
  category: 'GARAGE',
  description: 'word '.repeat(200),
  address: '12 King St',
  suburb: 'Newtown',
  city: 'Sydney',
  startTime: '09:00',
  endTime: '13:00',
  priceNote: 'Free entry',
  date: '2026-11-01',
  schedule: 'One-off',
}

test('maps a full listing and caps the description at 400 characters', () => {
  const board = localToBoard(full)
  assert.equal(board.description.length, 400)
  assert.equal(board.description, full.description!.slice(0, 400))
  assert.equal(board.time, '09:00')
  assert.equal(board.endTime, '13:00')
  assert.equal(board.venueName, '12 King St')
  assert.equal(board.category, 'Garage sale')
  assert.equal(board.isFree, true)
  assert.equal(board.price, 'Free entry')
  assert.equal(board.city, 'Sydney')
})

test('a missing or null description degrades to an empty string', () => {
  const rest: LocalOccurrence = { ...full, description: undefined }
  assert.equal(localToBoard(rest).description, '')
  assert.equal(localToBoard({ ...full, description: null }).description, '')
})

test('the shaped /api/local feed item does not throw', () => {
  const item = {
    city: 'Sydney',
    date: '2026-11-01',
    href: '/local/market',
    id: 'abc',
    isFree: true,
    kind: 'local',
    price: null,
    section: 'markets',
    suburb: 'Newtown',
    time: '09:00',
    title: 'Market',
  }
  const board = localToBoard(item as unknown as LocalOccurrence)
  assert.equal(board.description, '')
  assert.equal(board.title, 'Market')
  assert.equal(board.id, 'local-abc-2026-11-01')
})
