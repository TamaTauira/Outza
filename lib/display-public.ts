import { CATEGORIES } from '@/lib/categories'

const EMOJI = /[\p{Extended_Pictographic}\uFE0F\u200D]/gu

/** Public title. Stored titles stay as the feed sent them. */
export function displayTitle(raw: string | null | undefined): string {
  const original = (raw ?? '').replace(/\s+/g, ' ').trim()
  let title = original.replace(EMOJI, ' ').replace(/\s+/g, ' ').trim()
  title = title.replace(/\s*[|–—-]\s*(?:\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{1,2}\s+[A-Za-z]{3,9}(?:\s+\d{4})?)\s*$/u, '').trim()
  const letters = title.replace(/[^A-Za-z]/g, '')
  if (letters.length >= 8 && letters === letters.toUpperCase()) {
    title = title.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_m, lead, letter) => `${lead}${letter.toUpperCase()}`)
  }
  return title || original
}

/** Public price line. An unknown price points at the source instead of “Price TBA”. */
export function displayPriceValue(value: string, kind: 'free' | 'paid' | 'unknown'): string {
  if (kind === 'unknown' || /^price tba$/i.test(value.trim())) return 'Tickets at source'
  return value
}

export function runsUntilLabel(date?: string | null, endDate?: string | null): string | null {
  const start = (date ?? '').slice(0, 10)
  const end = (endDate ?? '').slice(0, 10)
  if (!start || !end || end <= start) return null
  const label = new Date(`${end}T12:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `Runs until ${label}`
}

const PARENTS: [RegExp, string][] = [
  [/music|gig|concert|dj\b|band\b|jazz|festival/, 'Music'],
  [/art|theatre|theater|comedy|exhibition|dance|film|gallery|opera|circus/, 'Arts & Culture'],
  [/sport|football|rugby|cricket|tennis|run\b|marathon/, 'Sports'],
  [/food|drink|wine|beer|dining|market/, 'Food & Drink'],
  [/family|kid|child/, 'Family'],
  [/club|nightlife|party|bar\b/, 'Nightlife'],
  [/yoga|wellness|fitness|meditat/, 'Wellness'],
  [/conference|network|business|expo/, 'Business'],
  [/talk|tour|course|workshop|class\b/, 'Education'],
]

/** One of the public parent categories. A known name stays. Anything else is grouped for colour and the chip. */
export function parentCategory(raw: string | null | undefined): string {
  const name = (raw ?? '').trim()
  if (CATEGORIES.some((item) => item.name === name)) return name
  const text = name.toLowerCase()
  for (const [pattern, parent] of PARENTS) {
    if (pattern.test(text)) return parent
  }
  return name ? 'Community' : ''
}
