import assert from 'node:assert/strict'
import { test } from 'node:test'
import { VERIFY_GATE_MESSAGE } from './account-trust'
import { submitGatedClaim } from './claims'

const me = { id: 'user-1', role: 'PROMOTER', email: 'sam@acme-events.com.au', name: 'Sam' }

test('an unverified account is refused by the gate before any claim is written', async () => {
  let submitted = false
  const r = await submitGatedClaim(me, 'event-1', { orgName: 'Acme Events' }, {
    gate: async () => ({ status: 403, error: VERIFY_GATE_MESSAGE }),
    submit: async () => { submitted = true; return { status: 200, body: { ok: true } } },
  })
  assert.equal(r.status, 403)
  assert.deepEqual(r.body, { error: VERIFY_GATE_MESSAGE })
  assert.equal(submitted, false)
})

test('the gate is checked for the claiming user, and only then does the claim go through', async () => {
  const gatedFor: string[] = []
  const r = await submitGatedClaim(me, 'event-1', { orgName: 'Acme Events' }, {
    gate: async (userId) => { gatedFor.push(userId); return null },
    submit: async () => ({ status: 200, body: { ok: true, status: 'PENDING', created: true } }),
  })
  assert.deepEqual(gatedFor, ['user-1'])
  assert.equal(r.status, 200)
  assert.deepEqual(r.body, { ok: true, status: 'PENDING', created: true })
})

test('the evidence fields reach the claim unchanged on both surfaces', async () => {
  const body = {
    orgName: 'Acme Events',
    position: 'Promoter',
    evidenceUrl: 'https://acme-events.com.au',
    message: 'We run this night — happy to show the venue contract.',
  }
  for (const eventId of ['event-9', 'event-10']) {
    const seen: unknown[] = []
    const r = await submitGatedClaim(me, eventId, body, {
      gate: async () => null,
      submit: async (m, id, b) => { seen.push(m, id, b); return { status: 200, body: { ok: true } } },
    })
    assert.equal(r.status, 200)
    assert.equal(seen[0], me)
    assert.equal(seen[1], eventId)
    assert.deepEqual(seen[2], body)
  }
})
