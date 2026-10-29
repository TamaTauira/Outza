import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_FROM_EMAIL, emailSendingEnabled, publicEmailError, sendEmail } from './email'

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
    assert.equal(DEFAULT_FROM_EMAIL, 'VibePeep <onboarding@resend.dev>')
    assert.equal(/outza\.app|abacus/i.test(DEFAULT_FROM_EMAIL), false)
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
  process.env.RESEND_FROM_EMAIL = 'VibePeep <news@example.com>'
  let body: { from?: string } = {}
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ id: 'email_456' }), { status: 200 })
  }
  try {
    const result = await sendEmail({ to: 'person@example.com', subject: 'Hello', html: '<p>Hi</p>' })
    assert.deepEqual(result, { ok: true })
    assert.equal(body.from, 'VibePeep <news@example.com>')
  } finally {
    globalThis.fetch = originalFetch
    restoreEnv('RESEND_API_KEY', key)
    restoreEnv('RESEND_FROM_EMAIL', from)
  }
})

test('a Resend 403 from the onboarding sender is logged as a domain restriction', async () => {
  const key = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  const originalFetch = globalThis.fetch
  const originalError = console.error
  const logs: unknown[][] = []
  process.env.RESEND_API_KEY = 're_test_key'
  process.env.RESEND_FROM_EMAIL = 'VibePeep <onboarding@resend.dev>'
  console.error = (...args: unknown[]) => { logs.push(args) }
  globalThis.fetch = async () => new Response(JSON.stringify({
    message: 'You can only send testing emails to your own email address (owner@example.com). To send emails to other recipients, please verify a domain at resend.com/domains.',
  }), { status: 403 })
  try {
    const result = await sendEmail({ to: 'person@example.com', subject: 'Hello', html: '<p>Hi</p>' })
    assert.equal(result.ok, false)
    assert.equal(result.restricted, true)
    assert.equal(result.error?.includes('@'), false)
    assert.match(result.error ?? '', /testing emails/)
    assert.match(publicEmailError(result.error), /RESEND_FROM_EMAIL/)
    assert.equal(publicEmailError(result.error).includes('@'), false)
    assert.equal(logs.some((line) => String(line).includes('verified sending domain')), true)
    assert.equal(logs.some((line) => String(line).includes('owner@example.com')), false)
  } finally {
    globalThis.fetch = originalFetch
    console.error = originalError
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
