import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reactionsEnabled } from './feature-flags'

test('reactions stay on when the switch is unset', () => {
  assert.equal(reactionsEnabled({}), true)
  assert.equal(reactionsEnabled({ EVENT_REACTIONS: '0' }), false)
})
