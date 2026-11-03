import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dailyAudioPlaybackEnabled, dailyBriefingEnabled, eventInsightAiEnabled, reactionsEnabled } from './feature-flags'

test('playback stays off until a speech model, a credential and a bucket are set', () => {
  const bare = {}
  assert.equal(reactionsEnabled(bare), true)
  assert.equal(dailyBriefingEnabled(bare), true)
  assert.equal(dailyAudioPlaybackEnabled(bare), false)
  assert.equal(eventInsightAiEnabled(bare), false)
  assert.equal(dailyAudioPlaybackEnabled({
    AI_GATEWAY_TTS_MODEL: 'openai/tts-1',
    AI_GATEWAY_API_KEY: 'test',
    AWS_BUCKET_NAME: 'bucket',
  }), true)
  assert.equal(dailyAudioPlaybackEnabled({
    AI_GATEWAY_TTS_MODEL: 'openai/tts-1',
    AI_GATEWAY_API_KEY: 'test',
    AWS_BUCKET_NAME: 'bucket',
    DAILY_AUDIO: '0',
  }), false)
  assert.equal(eventInsightAiEnabled({ EVENT_INSIGHT_AI: '1', AI_GATEWAY_API_KEY: 'test' }), true)
})
