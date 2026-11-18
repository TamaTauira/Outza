import assert from 'node:assert/strict'
import test from 'node:test'
import { ACCESSIBILITY_FALLBACK_EMAIL, ACCESSIBILITY_STANDARD, ACCESSIBILITY_UPDATED, accessibilityEmail } from './accessibility'

test('the accessibility statement names WCAG 2.2 AA and a contact address', () => {
  assert.equal(ACCESSIBILITY_STANDARD, 'WCAG 2.2 Level AA')
  assert.match(ACCESSIBILITY_UPDATED, /2026/)
  const previous = process.env.ACCESSIBILITY_EMAIL
  const contact = process.env.CONTACT_EMAIL
  delete process.env.ACCESSIBILITY_EMAIL
  delete process.env.CONTACT_EMAIL
  assert.equal(accessibilityEmail(), ACCESSIBILITY_FALLBACK_EMAIL)
  process.env.ACCESSIBILITY_EMAIL = 'access@example.com'
  assert.equal(accessibilityEmail(), 'access@example.com')
  if (previous == null) delete process.env.ACCESSIBILITY_EMAIL
  else process.env.ACCESSIBILITY_EMAIL = previous
  if (contact == null) delete process.env.CONTACT_EMAIL
  else process.env.CONTACT_EMAIL = contact
})
