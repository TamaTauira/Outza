/**
 * Fancy-text alphabets promoters paste into titles (mathematical bold, fullwidth,
 * circled, and the other contiguous letter styles). They are not ASCII, so a
 * case-insensitive "gay" search never sees "𝗚𝗔𝗬" until these are folded.
 * Ranges are the 26-letter blocks with no holes. Script, fraktur, italic small,
 * and double-struck capitals skip letters and are left alone.
 */
const STYLE_UPPER = [0x1d400, 0x1d468, 0x1d4d0, 0x1d56c, 0x1d5a0, 0x1d5d4, 0x1d608, 0x1d63c, 0x1d670, 0xff21, 0x24b6]
const STYLE_LOWER = [0x1d41a, 0x1d482, 0x1d4ea, 0x1d586, 0x1d5ba, 0x1d5ee, 0x1d622, 0x1d656, 0x1d68a, 0xff41, 0x24d0]

/** Mathematical sans-serif bold capitals. This is the style on the Moshtix title. */
export const SANS_BOLD_UPPER = 0x1d5d4

const TO_ASCII = new Map<number, string>()
for (const start of STYLE_UPPER) {
  for (let i = 0; i < 26; i++) TO_ASCII.set(start + i, String.fromCharCode(65 + i))
}
for (const start of STYLE_LOWER) {
  for (let i = 0; i < 26; i++) TO_ASCII.set(start + i, String.fromCharCode(97 + i))
}

/** Uppercase A–Z (or lowercase a–z) written in one fancy alphabet. */
export function styleLetters(text: string, alphabetStart: number): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    if (code >= 65 && code <= 90) out += String.fromCodePoint(alphabetStart + (code - 65))
    else if (code >= 97 && code <= 122) out += String.fromCodePoint(alphabetStart + (code - 97))
    else out += ch
  }
  return out
}

/** Case, accents, and fancy letters folded to plain lowercase words. */
export function foldSearchText(value: string | null | undefined): string {
  if (!value) return ''
  let mapped = ''
  for (const ch of value.normalize('NFKC')) {
    const cp = ch.codePointAt(0)!
    mapped += TO_ASCII.get(cp) ?? ch
  }
  return mapped
    .toLowerCase()
    .replace(/[-–—'’]/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Spellings a SQL `contains` can see. ASCII is matched case-insensitively by the
 * database; the fancy alphabets have no case mapping, so each style is its own needle.
 */
export function searchSpellings(word: string): string[] {
  const plain = word.toLowerCase()
  const forms = new Set<string>([plain])
  if (!/^[a-z]+$/.test(plain)) return [...forms]
  const upper = plain.toUpperCase()
  for (const start of STYLE_UPPER) forms.add(styleLetters(upper, start))
  for (const start of STYLE_LOWER) forms.add(styleLetters(plain, start))
  return [...forms]
}

/**
 * Words that mean the same night out. "drag" alone is not one: drag racing is a sport.
 * SQL only needs the stems: "gay" is already inside "gays", and "lgbt" is inside "lgbtiq".
 */
export const LGBTI_TERMS = ['gay', 'gays', 'queer', 'queers', 'lgbt', 'lgbtq', 'lgbti', 'lgbtiq', 'lgbtqia', 'pride', 'prides', 'lesbian', 'lesbians'] as const
export const LGBTI_NEEDLES = ['gay', 'queer', 'lgbt', 'pride', 'lesbian'] as const

export function isLgbtiTerm(word: string): boolean {
  const w = word.toLowerCase()
  if (w.startsWith('lgbt')) return true
  return (LGBTI_TERMS as readonly string[]).includes(w)
}

/** Whole-word hit for a queer term, including "mardi gras" and "drag queen". */
export function hasLgbtiText(folded: string): boolean {
  if (!folded) return false
  if (folded.includes('mardi gras')) return true
  if (/\bdrag queens?\b/.test(folded) || /\bdrag shows?\b/.test(folded)) return true
  return folded.split(' ').some((token) => isLgbtiTerm(token))
}
