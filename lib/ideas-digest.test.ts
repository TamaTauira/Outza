import assert from 'node:assert/strict'
import test from 'node:test'
import { fallbackThemes, ideasDigestDue, readIdea, signIdea } from './ideas-digest'
import { legalNoticeAction } from './legal-notice'

test('the ideas summary is due on the 1st from 9am Sydney and skips an empty pile', () => {
  const first = new Date('2026-11-30T22:00:00.000Z') // 1 Dec 2026 9:00am AEDT
  const before = new Date('2026-11-30T21:00:00.000Z') // 1 Dec 8:00am AEDT
  const later = new Date('2026-11-30T23:30:00.000Z')
  assert.equal(ideasDigestDue(before, null), false)
  assert.equal(ideasDigestDue(first, null), true)
  assert.equal(ideasDigestDue(later, first), false)
  assert.equal(ideasDigestDue(new Date('2026-12-31T22:00:00.000Z'), first), true)
  assert.deepEqual(fallbackThemes({ suggestions: [], requests: [], searches: [{ query: 'jazz', count: 1 }] }), [])
  assert.equal(fallbackThemes({ suggestions: ['A night market filter'], requests: [], searches: [] }).length, 1)
})

test('an idea approval link expires and rejects a swapped signature', () => {
  const previous = process.env.AUTH_SECRET
  const nextAuth = process.env.NEXTAUTH_SECRET
  process.env.AUTH_SECRET = 'ideas-test-secret'
  delete process.env.NEXTAUTH_SECRET
  try {
    const token = signIdea({ title: 'Night filter', detail: 'Let people filter night markets.', effort: 'S' }, Date.parse('2026-12-01T00:00:00.000Z'))
    assert.ok(token)
    assert.equal(readIdea(token!, Date.parse('2026-12-01T00:00:00.000Z'))?.title, 'Night filter')
    assert.equal(readIdea(token!, Date.parse('2027-01-01T00:00:00.000Z')), null)
    assert.equal(readIdea(`${token}x`, Date.parse('2026-12-01T00:00:00.000Z')), null)
  } finally {
    if (previous === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = previous
    if (nextAuth === undefined) delete process.env.NEXTAUTH_SECRET
    else process.env.NEXTAUTH_SECRET = nextAuth
  }
})

test('a legal notice anchors the current version and sends only when it changes', () => {
  assert.equal(legalNoticeAction(null, '2026-11-18'), 'anchor')
  assert.equal(legalNoticeAction('2026-11-18', '2026-11-18'), 'skip')
  assert.equal(legalNoticeAction('2026-11-18', '2026-12-01'), 'send')
})
