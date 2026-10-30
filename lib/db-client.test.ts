import assert from 'node:assert/strict'
import test from 'node:test'

test('event-page reads and the refresh job do not share a Prisma client', async () => {
  process.env.DATABASE_URL ??= 'postgresql://user:secret@localhost:5432/app'
  const db = await import('./db.ts')
  assert.notEqual(db.interactivePrisma, db.jobPrisma)
  assert.equal(db.prismaPool(), 'interactive')
  const pageDelegate = db.prisma.event
  assert.equal(pageDelegate, db.interactivePrisma.event)
  await db.runWithJobPrisma(async () => {
    assert.equal(db.prismaPool(), 'job')
    assert.equal(db.prisma.event, db.jobPrisma.event)
    assert.notEqual(db.prisma.event, pageDelegate)
    await Promise.resolve()
    assert.equal(db.prismaPool(), 'job')
  })
  assert.equal(db.prismaPool(), 'interactive')
  assert.equal(db.prisma.event, pageDelegate)
})
