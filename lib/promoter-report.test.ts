import assert from 'node:assert/strict'
import { test } from 'node:test'
import { publicReportHref } from './promoter-report'

const future = {
  id: 'evt1',
  title: 'Friday jazz',
  date: '2099-06-01T00:00:00.000Z',
  endDate: null,
  city: 'Sydney',
  hidden: false,
  moderationStatus: 'approved',
  deletedAt: null,
  approvalState: null as string | null,
}

test('promoter report links only live public events', () => {
  const live = publicReportHref(future, 'https://vibepeep.example')
  assert.equal(live, 'https://vibepeep.example/events/friday-jazz-evt1')
  assert.equal(publicReportHref({ ...future, hidden: true }, 'https://vibepeep.example'), null)
  assert.equal(publicReportHref({ ...future, moderationStatus: 'hidden' }, 'https://vibepeep.example'), null)
  assert.equal(publicReportHref({ ...future, moderationStatus: 'review' }, 'https://vibepeep.example'), null)
  assert.equal(publicReportHref({ ...future, deletedAt: '2026-11-01T00:00:00.000Z' }, 'https://vibepeep.example'), null)
  assert.equal(publicReportHref({ ...future, approvalState: 'PENDING' }, 'https://vibepeep.example'), null)
  assert.equal(publicReportHref({ ...future, date: '2020-01-01T00:00:00.000Z' }, 'https://vibepeep.example'), null)
  assert.match(publicReportHref({ ...future, approvalState: 'APPROVED' }, 'https://vibepeep.example') ?? '', /friday-jazz-evt1/)
})
