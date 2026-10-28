import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emailSendingEnabled, sendEmail } from './email'

test('email sending stays off without calling a mail API', async () => {
  assert.equal(emailSendingEnabled(), false)
  const result = await sendEmail({ to: 'person@example.com', subject: 'Hello', html: '<p>Hi</p>' })
  assert.deepEqual(result, { ok: false, disabled: true, error: 'Email sending is turned off' })
})
