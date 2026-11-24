import assert from 'node:assert/strict'
import test from 'node:test'
import { approvedReplyTemplate } from './reply-templates'
import { extractEventId, triageContact } from './contact-triage'

test('contact notes are sorted and never marked as auto-answered', () => {
  assert.equal(triageContact({ topic: 'Something else', message: 'Buy followers and guest post please' }).status, 'CLOSED')
  const refund = triageContact({ topic: 'Purchase', message: 'I was charged twice and need a refund please' })
  assert.equal(refund.category, 'purchase/refund')
  assert.equal(refund.status, 'ESCALATED')
  assert.equal(refund.draftReply?.includes('No acknowledgement'), true)
  const idea = triageContact({ topic: 'Something else', message: 'Feature request: a darker map at night' })
  assert.equal(idea.category, 'feature request')
  assert.equal(idea.status, 'DRAFTED')
  assert.equal(extractEventId('See https://vibepeep.example/events/cm123abc99 tonight'), 'cm123abc99')
  assert.equal(approvedReplyTemplate('ack-escalation'), null)
})
