import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emailLockup } from '../email-brand'
import { runQa } from './qa'

function report(html: string) {
  return runQa({
    html,
    text: 'Hello\n\nUnsubscribe: https://vibepeep.example/unsubscribe?u=1',
    subject: 'This week in Sydney',
    preview: 'A short preview',
    sections: [],
    sponsored: false,
    from: new Date('2026-10-29T00:00:00Z'),
    to: new Date('2026-11-05T00:00:00Z'),
    optedIn: true,
    realSend: false,
  })
}

const unsub = '<p><a href="https://vibepeep.example/unsubscribe?u=1">Unsubscribe</a></p>'

test('decorative images with an empty alt attribute do not block a digest', () => {
  const html = `${unsub}<img src="https://vibepeep.example/mascot.png" alt="" width="72" height="72" />`
  const qa = report(html)
  assert.equal(qa.errors.some((error) => /alt/i.test(error)), false)
  assert.equal(qa.pass, true)
})

test('an image with no alt attribute still blocks a digest', () => {
  const html = `${unsub}<img src="https://vibepeep.example/photo.png" width="120" height="120" />`
  const qa = report(html)
  assert.equal(qa.pass, false)
  assert.match(qa.errors.join(' '), /alt attribute/)
})

test('the email lockup gives every image an alt attribute', () => {
  const html = emailLockup()
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0])
  assert.ok(imgs.length >= 2)
  for (const tag of imgs) assert.match(tag, /\balt="/)
})
