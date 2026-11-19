import assert from 'node:assert/strict'
import { test } from 'node:test'
import { foldIcsLine } from './ics'

function unfold(value: string): string {
  return value.replace(/\r\n[ \t]/g, '')
}

function unpairedSurrogate(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
      i += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

test('ICS lines fold on UTF-8 octets and keep a surrogate pair intact', () => {
  const short = 'SUMMARY:Jazz'
  assert.equal(foldIcsLine(short), short)

  const ascii = `SUMMARY:${'A'.repeat(90)}`
  const folded = foldIcsLine(ascii)
  assert.equal(unfold(folded), ascii)
  for (const line of folded.split('\r\n')) {
    assert.ok(Buffer.byteLength(line, 'utf8') <= 75, line)
  }
  assert.match(folded, /\r\n /)

  const emoji = `${'A'.repeat(73)}😀${'B'.repeat(8)}`
  const withEmoji = foldIcsLine(emoji)
  assert.equal(unfold(withEmoji), emoji)
  assert.equal(unpairedSurrogate(withEmoji), false)
  assert.ok(withEmoji.split('\r\n').some((line) => line.includes('😀')))
  for (const line of withEmoji.split('\r\n')) {
    assert.ok(Buffer.byteLength(line, 'utf8') <= 75)
    assert.equal(unpairedSurrogate(line), false)
  }

  const accented = `${'A'.repeat(74)}éZ`
  const withAccent = foldIcsLine(accented)
  assert.equal(unfold(withAccent), accented)
  assert.ok(withAccent.split('\r\n').some((line) => line.includes('é')))
  for (const line of withAccent.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75)
})
