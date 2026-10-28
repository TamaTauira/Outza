import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_FROM_EMAIL, emailSendingEnabled, sendEmail } from './email'

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

test('email stays disabled and does not call a mail API without a Resend key', async () => {
  const key = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  const originalFetch = globalThis.fetch
  delete process.env.RESEND_API_KEY
  delete process.env.RESEND_FROM_EMAIL
  let called = false
  globalThis.fetch = async () => {
    called = true
    return new Response('{}', { status: 200 })
  }
  try {
    assert.equal(emailSendingEnabled(), false)
    process.env.RESEND_API_KEY = '   '
    assert.equal(emailSendingEnabled(), false)
    delete process.env.RESEND_API_KEY
    const result = await sendEmail({ to: 'person@example.com', subject: 'Hello', html: '<p>Hi</p>' })
    assert.deepEqual(result, { ok: false, disabled: true, error: 'Email sending is turned off' })
    assert.equal(called, false)
  } finally {
    globalThis.fetch = originalFetch
    restoreEnv('RESEND_API_KEY', key)
    restoreEnv('RESEND_FROM_EMAIL', from)
  }
})

test('sendEmail posts to the Resend API when the key is set', async () => {
  const key = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  const originalFetch = globalThis.fetch
  process.env.RESEND_API_KEY = 're_test_key'
  delete process.env.RESEND_FROM_EMAIL
  let captured: { url: string; init: RequestInit } | undefined
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init: init ?? {} }
    return new Response(JSON.stringify({ id: 'email_123' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    assert.equal(emailSendingEnabled(), true)
    const result = await sendEmail({ to: ' person@example.com ', subject: 'Hello', html: '<p>Hi</p>', text: 'Hi' })
    assert.deepEqual(result, { ok: true })
    assert.ok(captured)
    assert.equal(captured.url, 'https://api.resend.com/emails')
    assert.equal(captured.url.includes('abacus'), false)
    assert.equal(captured.init.method, 'POST')
    const headers = captured.init.headers as Record<string, string>
    assert.equal(headers.Authorization, 'Bearer re_test_key')
    assert.equal(headers['Content-Type'], 'application/json')
    assert.deepEqual(JSON.parse(String(captured.init.body)), {
      from: DEFAULT_FROM_EMAIL,
      to: ['person@example.com'],
      subject: 'Hello',
      html: '<p>Hi</p>',
      text: 'Hi',
    })
  } finally {
    globalThis.fetch = originalFetch
    restoreEnv('RESEND_API_KEY', key)
    restoreEnv('RESEND_FROM_EMAIL', from)
  }
})

test('RESEND_FROM_EMAIL overrides the default From address', async () => {
  const key = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  const originalFetch = globalThis.fetch
  process.env.RESEND_API_KEY = 're_test_key'
  process.env.RESEND_FROM_EMAIL = 'Outza <hello@outza.app>'
  let body: { from?: string } = {}
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ id: 'email_456' }), { status: 200 })
  }
  try {
    const result = await sendEmail({ to: 'person@example.com', subject: 'Hello', html: '<p>Hi</p>' })
    assert.deepEqual(result, { ok: true })
    assert.equal(body.from, 'Outza <hello@outza.app>')
  } finally {
    globalThis.fetch = originalFetch
    restoreEnv('RESEND_API_KEY', key)
    restoreEnv('RESEND_FROM_EMAIL', from)
  }
})

test('a Resend error is returned and does not count as disabled', async () => {
  const key = process.env.RESEND_API_KEY
  const originalFetch = globalThis.fetch
  process.env.RESEND_API_KEY = 're_test_key'
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Invalid `from` field.' }), { status: 422 })
  try {
    const result = await sendEmail({ to: 'person@example.com', subject: 'Hello', html: '<p>Hi</p>' })
    assert.deepEqual(result, { ok: false, error: 'Invalid `from` field.' })
  } finally {
    globalThis.fetch = originalFetch
    restoreEnv('RESEND_API_KEY', key)
  }
})
