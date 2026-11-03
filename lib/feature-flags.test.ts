import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eventInsightAiEnabled, reactionsEnabled } from './feature-flags'

test('reactions stay on and listing rewrites stay off until a gateway rewrite is asked for', () => {
  const bare = {}
  assert.equal(reactionsEnabled(bare), true)
  assert.equal(eventInsightAiEnabled(bare), false)
  assert.equal(eventInsightAiEnabled({ EVENT_INSIGHT_AI: '1', AI_GATEWAY_API_KEY: 'test' }), true)
})
