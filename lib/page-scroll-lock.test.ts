import assert from 'node:assert/strict'
import test from 'node:test'
import { engageScrollLock, releaseScrollLock, scrollLockStyles } from './page-scroll-lock'

test('a scroll lock pins the body at the current offset', () => {
  assert.deepEqual(scrollLockStyles(842.4), {
    position: 'fixed',
    top: '-842px',
    left: '0',
    right: '0',
    width: '100%',
    overflow: 'hidden',
  })
})

test('nested locks keep the first offset and restore it once', () => {
  const first = engageScrollLock({ depth: 0, scrollY: 0 }, 420)
  assert.equal(first.styles?.top, '-420px')
  const second = engageScrollLock(first.state, 900)
  assert.equal(second.styles, null)
  assert.equal(second.state.scrollY, 420)
  const still = releaseScrollLock(second.state)
  assert.equal(still.restoreY, null)
  assert.equal(still.state.depth, 1)
  const done = releaseScrollLock(still.state)
  assert.equal(done.restoreY, 420)
  assert.equal(done.state.depth, 0)
})
