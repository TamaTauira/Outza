/**
 * Text written through Prisma must be well-formed Unicode.
 *
 * Prisma serialises the query as JSON. A lone UTF-16 surrogate (what
 * `String.prototype.slice` produces when it cuts an emoji in half) is encoded
 * as a `\u` escape with no partner, and the engine rejects it with
 * "unexpected end of hex escape" before the row is written. Postgres raises
 * the same message for a backslash escape (`\x` / `\u`) that runs out of hex
 * digits. Either one aborts the Moshtix save.
 *
 * Repair those sequences and keep the rest of the text. The listing is saved;
 * only the bytes that cannot be stored are changed.
 */

function stripUnpairedSurrogates(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = s.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += s[i] + s[i + 1]
        i++
      }
      continue
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue
    out += s[i]
  }
  return out
}

function truncateCodePoints(s: string, max: number): string {
  if (max <= 0) return ''
  const chars = Array.from(s)
  if (chars.length <= max) return s
  return chars.slice(0, max).join('').trimEnd()
}

/** True when `rest` begins a `\x` / `\u` escape that does not have enough hex digits. */
function incompleteHexEscape(rest: string): boolean {
  if (rest.startsWith('x')) return !/^x[0-9A-Fa-f]{2}/.test(rest)
  if (rest.startsWith('u')) return !/^u[0-9A-Fa-f]{4}/.test(rest)
  return false
}

/**
 * An odd run of backslashes starts an escape. If that escape is unfinished
 * (`\`, `\x`, `\x4`, `\u12`), add one backslash so the run is even and the
 * characters are stored literally. A second pass sees an even run and stops.
 */
export function repairDbEscapes(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '\\') {
      out += s[i]
      continue
    }
    let j = i
    while (j < s.length && s[j] === '\\') j++
    const count = j - i
    const rest = s.slice(j)
    const odd = count % 2 === 1
    const needsPair = odd && (rest.length === 0 || incompleteHexEscape(rest))
    out += '\\'.repeat(count + (needsPair ? 1 : 0))
    i = j - 1
  }
  return out
}

function asString(input: unknown): string {
  if (typeof input === 'string') return input
  if (typeof input === 'number' || typeof input === 'boolean') return String(input)
  return ''
}

function finish(input: string, max: number): string {
  return repairDbEscapes(truncateCodePoints(stripUnpairedSurrogates(input.replace(/\u0000/g, '')), max))
}

/** Prose: strip tags, drop unpaired surrogates, collapse the gaps that leaves, then make escapes safe. */
export function sanitizeDbText(input: unknown, max = 600): string {
  if (input == null) return ''
  const plain = stripUnpairedSurrogates(asString(input).replace(/<[^>]+>/g, ' ').replace(/\u0000/g, ''))
  return finish(plain.replace(/\s+/g, ' ').trim(), max)
}

/** URLs and other single-line values. Null when nothing remains. */
export function sanitizeDbUrl(input: unknown, max = 2000): string | null {
  if (input == null) return null
  const repaired = finish(asString(input).trim(), max)
  return repaired || null
}
