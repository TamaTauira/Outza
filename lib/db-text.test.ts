import assert from 'node:assert/strict'
import test from 'node:test'
import { repairDbEscapes, sanitizeDbText, sanitizeDbUrl } from './db-text'

function wellFormed(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = s.charCodeAt(i + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
      i++
      continue
    }
    if (code >= 0xdc00 && code <= 0xdfff) return false
  }
  return true
}

/** An odd backslash run that starts an unfinished `\x` / `\u` escape, or a trailing `\`. */
function hasBrokenEscape(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '\\') continue
    let j = i
    while (j < s.length && s[j] === '\\') j++
    const rest = s.slice(j)
    const odd = (j - i) % 2 === 1
    const broken = rest.length === 0 || (rest[0] === 'x' && !/^x[0-9A-Fa-f]{2}/.test(rest)) || (rest[0] === 'u' && !/^u[0-9A-Fa-f]{4}/.test(rest))
    if (odd && broken) return true
    i = j - 1
  }
  return false
}

test('keeps a Moshtix description that mixes emoji with broken hex escapes', () => {
  const raw = '<p>Night market 🥳</p> doors \\x open, code \\u12, end\\'
  const saved = sanitizeDbText(raw, 600)
  assert.equal(wellFormed(saved), true)
  assert.equal(hasBrokenEscape(saved), false)
  assert.match(saved, /Night market 🥳/)
  assert.match(saved, /doors/)
  assert.match(saved, /open/)
  assert.match(saved, /code/)
  assert.match(saved, /end/)
  assert.doesNotMatch(saved, /<p>/)
  assert.equal(sanitizeDbText(saved, 600), saved)
})

test('does not cut an emoji in half the way slice() does', () => {
  const emoji = '🥳'
  const raw = 'a'.repeat(599) + emoji
  const sliced = raw.slice(0, 600)
  assert.equal(wellFormed(sliced), false)
  const kept = sanitizeDbText(raw, 600)
  assert.equal(wellFormed(kept), true)
  assert.equal(kept.endsWith(emoji), true)
  const shortened = sanitizeDbText(raw, 599)
  assert.equal(wellFormed(shortened), true)
  assert.equal(shortened.includes(emoji), false)
  assert.equal([...shortened].length, 599)
})

test('drops a lone surrogate and keeps the surrounding words', () => {
  const raw = `Doors \uD83D open \uDE00 late`
  assert.equal(wellFormed(raw), false)
  const saved = sanitizeDbText(raw, 600)
  assert.equal(wellFormed(saved), true)
  assert.equal(saved, 'Doors open late')
})

test('leaves ordinary backslashes and complete hex escapes alone', () => {
  assert.equal(sanitizeDbText('AC\\DC live', 600), 'AC\\DC live')
  assert.equal(sanitizeDbText('hex \\x41 ok', 600), 'hex \\x41 ok')
  assert.equal(sanitizeDbText('uni \\u0041 ok', 600), 'uni \\u0041 ok')
  assert.equal(repairDbEscapes('already \\\\x done'), 'already \\\\x done')
})

test('strips null bytes and tags without throwing', () => {
  assert.equal(sanitizeDbText('a\u0000<b>b</b>   c', 20), 'a b c')
  assert.equal(sanitizeDbText(null, 20), '')
  assert.equal(sanitizeDbText({ text: 'nope' }, 20), '')
  assert.equal(typeof sanitizeDbText('\\', 10), 'string')
  assert.equal(hasBrokenEscape(sanitizeDbText('\\', 10)), false)
})

test('repairs a url without stripping it', () => {
  const saved = sanitizeDbUrl(' https://tickets.example/e\\x ', 200)
  assert.equal(saved, 'https://tickets.example/e\\\\x')
  assert.equal(wellFormed(saved!), true)
  assert.equal(hasBrokenEscape(saved!), false)
  assert.equal(sanitizeDbUrl(null, 20), null)
})
