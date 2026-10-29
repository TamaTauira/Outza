import assert from 'node:assert/strict'
import { test } from 'node:test'
import { duplicatePrimaryId, pendingTotal, queueDecision, reportListingEffect, toggleAll, toggleSelection } from './trust-queue'

test('the badge counts open reports, claims, and quality flags', () => {
  assert.equal(pendingTotal({ reports: 2, claims: 1, flags: 3 }), 6)
  assert.equal(pendingTotal({ reports: 0, claims: 0, flags: 0 }), 0)
  assert.equal(pendingTotal({ reports: -1, claims: 4, flags: Number.NaN }), 4)
})

test('approve and dismiss map onto the existing report and claim statuses', () => {
  assert.equal(queueDecision('report', 'approve').status, 'RESOLVED')
  assert.equal(queueDecision('report', 'dismiss').status, 'DISMISSED')
  assert.equal(queueDecision('claim', 'approve').effect, 'approve-claim')
  assert.equal(queueDecision('claim', 'dismiss').status, 'REJECTED')
  assert.equal(queueDecision('flag', 'approve').status, 'APPROVED')
  assert.equal(reportListingEffect('CANCELLED', 'approve'), 'cancel')
  assert.equal(reportListingEffect('CANCELLED', 'dismiss'), 'none')
  assert.equal(reportListingEffect('WRONG_DATE', 'approve'), 'none')
})

test('a flagged duplicate names the listing it should be linked to', () => {
  assert.equal(duplicatePrimaryId('Likely duplicate of cmabc123 (Jazz night). Left in place because it is organiser-owned or promoted.'), 'cmabc123')
  assert.equal(duplicatePrimaryId('12 scheduled listings are before today.'), null)
})

test('select all fills the visible queue and a second tap clears it', () => {
  const keys = ['report:a', 'claim:b']
  const once = toggleAll([], keys)
  assert.deepEqual(once, keys)
  assert.deepEqual(toggleAll(once, keys), [])
  assert.deepEqual(toggleSelection(once, 'report:a'), ['claim:b'])
})
