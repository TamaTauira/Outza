import assert from 'node:assert/strict'
import test from 'node:test'
import { endCampaignConfirm, endCampaignMessage } from './promotion-end'

test('ending a test-mode campaign says nothing was charged', () => {
  assert.match(endCampaignMessage(['test', 'test']), /Test mode/)
  assert.match(endCampaignConfirm('Spotlight', true), /nothing is refunded/)
})

test('ending a card campaign does not promise a refund', () => {
  assert.match(endCampaignMessage(['stripe']), /not sent from here/)
  assert.doesNotMatch(endCampaignMessage(['test', 'stripe']), /Test mode/)
})
