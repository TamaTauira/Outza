import assert from 'node:assert/strict'
import test from 'node:test'
import { assertTestInbox, configuredTestInbox } from './email-test-inbox'

test('test sends refuse every address except the configured inbox', () => {
  assert.equal(configuredTestInbox(''), null)
  assert.equal(configuredTestInbox('not-an-email'), null)
  assert.equal(assertTestInbox('sam@example.com', '').ok, false)
  assert.equal(assertTestInbox('sam@example.com', 'owner@resend.dev').ok, false)
  assert.deepEqual(assertTestInbox(' Owner@Resend.dev ', 'owner@resend.dev'), { ok: true, to: 'owner@resend.dev' })
})
