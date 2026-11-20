import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { promoterLoginHref, promoterTabHref } from './promoter-nav'

test('promoter tab changes keep the rest of the query', () => {
  assert.equal(promoterTabHref('', 'events'), '/promoter?tab=events')
  const billing = new URLSearchParams(promoterTabHref('?paid=1', 'billing').split('?')[1])
  assert.equal(billing.get('tab'), 'billing')
  assert.equal(billing.get('paid'), '1')
  const overview = new URLSearchParams(promoterTabHref('?tab=events&paid=1', 'overview').split('?')[1])
  assert.equal(overview.get('tab'), 'overview')
  assert.equal(overview.get('paid'), '1')
})

test('the promoter menu has no Create item', () => {
  const shell = readFileSync(new URL('../components/promoter-shell.tsx', import.meta.url), 'utf8')
  assert.equal(shell.includes('#create'), false)
  assert.equal(shell.includes("label: 'Create'"), false)
  for (const label of ['Dashboard', 'My events', 'Promote an event', 'Short boosts', 'Intelligence', 'Local business ads', 'Analytics', 'Billing']) {
    assert.equal(shell.includes(`label: '${label}'`), true)
  }
})

test('logged-out promoter visits keep the tab on the login next path', () => {
  assert.equal(promoterLoginHref({}), '/login?next=%2Fpromoter')
  assert.equal(promoterLoginHref({ tab: 'events' }), '/login?next=%2Fpromoter%3Ftab%3Devents')
  assert.equal(promoterLoginHref({ tab: ['billing', 'events'] }), '/login?next=%2Fpromoter%3Ftab%3Dbilling%26tab%3Devents')
})
