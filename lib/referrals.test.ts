import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyReferral } from './referrals'

test('a former Abacus host is not counted as this site', () => {
  assert.equal(classifyReferral('https://outza.abacusai.app/events/1', 'outza-outza.vercel.app', {}), 'OTHER')
  assert.equal(classifyReferral('https://outza-outza.vercel.app/events/1', 'outza-outza.vercel.app', {}), 'OUTZA')
})
