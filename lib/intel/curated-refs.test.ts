import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CURATED_REFERENCES, brisbaneFootfallGap, footfallCaveat, isReferenceShowable, referenceProblems, sydneyFootfallGap, visibleRefs,
  type CuratedRef,
} from './curated-refs'
import { footfallMissingDetail } from './markets'

const asOf = new Date('2026-11-03T00:00:00Z')

const sample: CuratedRef = {
  id: 'sample', kind: 'venue', name: 'Sample Room', url: 'https://example.com/room',
  note: 'Open at 1 Example Street.', lastVerified: '2026-11-03', sourceUrl: 'https://example.com/source',
}

test('every curated intelligence reference is verified and not older than six months', () => {
  const now = new Date()
  for (const ref of CURATED_REFERENCES) {
    assert.deepEqual(referenceProblems(ref, now), [], `${ref.id} ${referenceProblems(ref, now).join(',')}`)
    assert.equal(isReferenceShowable(ref, now), true)
  }
})

test('a check older than six months is stale, and an exact six-month check is still shown', () => {
  assert.deepEqual(referenceProblems({ ...sample, lastVerified: '2026-05-03' }, asOf), [])
  assert.deepEqual(referenceProblems({ ...sample, lastVerified: '2026-05-02' }, asOf), ['stale'])
})

test('a missing source, a bad date, or a future date is unverified and hidden', () => {
  const missing = { ...sample, sourceUrl: '' }
  const blankDate = { ...sample, lastVerified: '' }
  const future = { ...sample, lastVerified: '2026-11-04' }
  assert.deepEqual(referenceProblems(missing, asOf), ['unverified'])
  assert.ok(referenceProblems(blankDate, asOf).includes('unverified'))
  assert.deepEqual(referenceProblems(future, asOf), ['unverified'])
  const stale = { ...sample, lastVerified: '2025-01-01' }
  assert.deepEqual(visibleRefs([missing, blankDate, future, stale, sample], asOf).map((row) => row.id), ['sample'])
})

test('a stale or unverified reference is also stale when both problems apply', () => {
  const both = { ...sample, lastVerified: '2020-01-01', sourceUrl: 'not a url' }
  assert.deepEqual(referenceProblems(both, asOf), ['unverified', 'stale'])
})

test('footfall copy hides street and mall names once the check is stale', () => {
  assert.match(footfallMissingDetail('Brisbane', asOf), /Queen Street Mall/)
  assert.match(footfallMissingDetail('Sydney', asOf), /Elizabeth Street/)
  assert.doesNotMatch(footfallMissingDetail('Sydney', asOf), /CC BY 4\.0/)
  const later = new Date('2027-06-01T00:00:00Z')
  assert.doesNotMatch(brisbaneFootfallGap(later), /Queen Street Mall/)
  assert.doesNotMatch(sydneyFootfallGap(later), /Elizabeth Street/)
  assert.doesNotMatch(footfallCaveat('sydney', later), /Bridge Street/)
  assert.match(footfallCaveat('sydney', later), /hidden|checked again|Nothing is estimated/)
})
