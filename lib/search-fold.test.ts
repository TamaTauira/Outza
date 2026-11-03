import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkLGBTI } from './categories'
import { foldSearchText, hasLgbtiText, searchSpellings, SANS_BOLD_UPPER, styleLetters } from './search-fold'

test('fancy capitals fold to the same words as plain text', () => {
  const styled = styleLetters('BIG GAY BLOCK PARTY', SANS_BOLD_UPPER)
  assert.equal(foldSearchText(styled), 'big gay block party')
  assert.equal(foldSearchText('BIG GAY BLOCK PARTY'), 'big gay block party')
  assert.equal(foldSearchText('Big Gay Block Party'), 'big gay block party')
  assert.ok(searchSpellings('gay').includes(styleLetters('GAY', SANS_BOLD_UPPER)))
  assert.ok(searchSpellings('gay').includes('gay'))
})

test('queer words match whole words, not Gaylard or drag racing', () => {
  assert.equal(hasLgbtiText(foldSearchText(styleLetters('BIG GAY BLOCK PARTY', SANS_BOLD_UPPER))), true)
  assert.equal(hasLgbtiText('jack gatto charlie gaylard elvis live in concert'), false)
  assert.equal(hasLgbtiText('drag racing at sydney dragway'), false)
  assert.equal(hasLgbtiText('a drag queen night'), true)
  assert.equal(checkLGBTI(styleLetters('BIG GAY BLOCK PARTY', SANS_BOLD_UPPER), ''), true)
  assert.equal(checkLGBTI('Drag Racing at Sydney Dragway', 'Run club members get a discount.'), false)
  assert.equal(checkLGBTI('Jazz at the basin', 'a normal gig'), false)
})
