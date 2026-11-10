import assert from 'node:assert/strict'
import { createHmac } from 'crypto'
import test from 'node:test'
import { readResendNotice, resendEventId, verifyResendWebhook } from './resend-webhook'

test('a Resend signature matches the raw body and rejects a stale or swapped one', () => {
  const secret = `whsec_${Buffer.from('metrics-secret').toString('base64')}`
  const body = JSON.stringify({ type: 'email.opened' })
  const id = 'msg_12345678'
  const timestamp = '1762812000'
  const key = Buffer.from('metrics-secret')
  const sig = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')
  const headers = { id, timestamp, signature: `v1,${sig}` }
  assert.equal(verifyResendWebhook(body, headers, secret, 1762812000 * 1000), true)
  assert.equal(verifyResendWebhook(`${body} `, headers, secret, 1762812000 * 1000), false)
  assert.equal(verifyResendWebhook(body, headers, secret, 1762812000 * 1000 + 6 * 60 * 1000), false)
  assert.equal(verifyResendWebhook(body, { ...headers, signature: 'v1,bm90aGlz' }, secret, 1762812000 * 1000), false)
})

test('open and click notices keep the edition id and drop everything else', () => {
  assert.deepEqual(readResendNotice({
    type: 'email.opened',
    data: { email_id: 'email_123', to: ['person@example.com'], tags: [{ name: 'send_id', value: 'cm123abc' }] },
  }), { kind: 'open', sendId: 'cm123abc', emailId: 'email_123' })
  assert.deepEqual(readResendNotice({
    type: 'email.clicked',
    data: { email_id: 'email_456', tags: { send_id: 'cm999xyz' } },
  }), { kind: 'click', sendId: 'cm999xyz', emailId: 'email_456' })
  assert.equal(readResendNotice({ type: 'email.bounced', data: {} }), null)
  assert.equal(readResendNotice({ type: 'email.opened', data: { tags: [{ name: 'send_id', value: 'nope' }] } })?.sendId, null)
  assert.equal(resendEventId('msg_12345678'), 'msg_12345678')
  assert.equal(resendEventId('bad id'), null)
})
