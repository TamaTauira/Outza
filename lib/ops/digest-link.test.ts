import assert from 'node:assert/strict'
import test from 'node:test'
import { digestEmail } from './digest-mail'
import { consumeDigestLink, digestResultPage, type DigestStore, type StoredDigestItem, type StoredToken } from './digest-link'
import { newDigestToken, tokenHash, verifyDigestToken } from './tokens'

const KEY = 'test-digest-secret-value'

test('digest tokens sign, expire, and reject tampering', () => {
  const now = Date.parse('2026-11-24T00:00:00.000Z')
  const { token, payload } = newDigestToken('item-1', 'approve', now, KEY)
  assert.equal(verifyDigestToken(token, now + 1000, KEY).ok, true)
  assert.equal(verifyDigestToken(token, payload.exp + 1, KEY).ok, false)
  const flipped = `${token.slice(0, -2)}${token.endsWith('a') ? 'b' : 'a'}`
  const bad = verifyDigestToken(flipped, now + 1000, KEY)
  assert.equal(bad.ok, false)
  assert.equal(verifyDigestToken(token, now + 1000, 'another-secret-value').ok, false)
})

function memoryStore(item: StoredDigestItem, tokens: StoredToken[]): DigestStore & { tokens: StoredToken[] } {
  return {
    tokens,
    async findToken(hash) { return tokens.find((row) => row.tokenHash === hash) ?? null },
    async findItem(id) { return id === item.id ? item : null },
    async claimToken(id, at) {
      const row = tokens.find((token) => token.id === id)
      if (!row || row.usedAt) return false
      row.usedAt = at
      return true
    },
    async releaseToken(id) {
      const row = tokens.find((token) => token.id === id)
      if (row) row.usedAt = null
    },
    async markItemTokensUsed(itemId, at) {
      for (const token of tokens) if (token.itemId === itemId && !token.usedAt) token.usedAt = at
    },
    async resolveItem(id, status) { if (id === item.id) item.status = status },
  }
}

test('a digest link works once', async () => {
  const now = Date.parse('2026-11-24T11:00:00.000Z')
  const approve = newDigestToken('item-9', 'approve', now, KEY)
  const decline = newDigestToken('item-9', 'decline', now, KEY)
  const item: StoredDigestItem = {
    id: 'item-9',
    status: 'OPEN',
    summary: 'Publish the trivia night.',
    payload: { approveAction: 'publish', declineAction: 'keep-hidden', eventId: 'evt' },
  }
  const store = memoryStore(item, [
    { id: 't1', tokenHash: tokenHash(approve.token), itemId: 'item-9', action: 'approve', expiresAt: new Date(approve.payload.exp), usedAt: null },
    { id: 't2', tokenHash: tokenHash(decline.token), itemId: 'item-9', action: 'decline', expiresAt: new Date(decline.payload.exp), usedAt: null },
  ])
  const applied: string[] = []
  const previous = process.env.OPS_DIGEST_SECRET
  process.env.OPS_DIGEST_SECRET = KEY
  try {
    const first = await consumeDigestLink({
      token: approve.token,
      now,
      store,
      apply: async (_item, action) => { applied.push(action) },
    })
    assert.equal(first.status, 'applied')
    assert.deepEqual(applied, ['approve'])
    assert.equal(item.status, 'APPROVED')
    const second = await consumeDigestLink({
      token: approve.token,
      now: now + 1000,
      store,
      apply: async () => { applied.push('again') },
    })
    assert.equal(second.status, 'used')
    const other = await consumeDigestLink({
      token: decline.token,
      now: now + 1000,
      store,
      apply: async () => { applied.push('decline') },
    })
    assert.equal(other.status, 'used')
    assert.deepEqual(applied, ['approve'])
  } finally {
    if (previous == null) delete process.env.OPS_DIGEST_SECRET
    else process.env.OPS_DIGEST_SECRET = previous
  }
})

test('the approvals email names VibePeep and keeps the logo', () => {
  const mail = digestEmail({
    items: [{ summary: 'Trivia night may be a duplicate.', approveUrl: 'https://vibepeep.example/api/ops/digest?token=approve', declineUrl: 'https://vibepeep.example/api/ops/digest?token=decline' }],
    handled: 12,
    extra: 0,
    undoUrl: 'https://vibepeep.example/admin/ops',
  })
  assert.match(mail.subject, /VibePeep/)
  assert.equal(/Outza/.test(mail.subject), false)
  const visible = mail.html.replace(/<[^>]+>/g, ' ')
  assert.equal(/Outza/i.test(visible), false)
  assert.match(mail.html, /token=approve/)
  assert.match(mail.html, /Bots handled 12/)
  assert.match(mail.html, /vibepeep-mascot|vibepeep-icon|VibePeep/)
  const page = digestResultPage({ status: 'used' })
  assert.match(page, /vibepeep-icon/)
  assert.equal(/Outza/i.test(page), false)
})
