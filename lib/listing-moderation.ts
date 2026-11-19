/** Rules that keep junk, unfinished and unmoderated listings off public pages. */

const JUNK_TITLE = /^\s*\[?test\]?\b/i
const JUNK_REPEAT = /\btest test\b/i
const PRIVATE_EVENT = /private event/i
const MODEL_PENDING = /\[model (pending|unconfirmed)\]/i
const STATUS_WORD = /\b(cancell?ed|postponed|sold[- ]?out|rescheduled)\b/i
const RALLY = /\b(protest|rally|demonstration)\b/i
const REVIEW = /\b(nylon cable ties|restrain and arrest|incite violence|firearm|self-harm|suicide bomb)\b/i
const FAKE_PAGE = /(^|\.)example\.(com|org|net)$|localhost|\.test$/i
const FAKE_IMAGE = /picsum\.photos|placehold\.co|via\.placeholder\.com|source\.unsplash\.com/i
const OFF_BOARD = /\b(bni|regus|\d-day training|one-day training)\b/i

export function junkTitle(title: string): boolean {
  return JUNK_TITLE.test(title) || JUNK_REPEAT.test(title) || PRIVATE_EVENT.test(title) || MODEL_PENDING.test(title)
}

/** Short blurbs are hidden on new ingests. An empty description is not treated as junk. */
export function junkDescription(description: string | null | undefined): boolean {
  if (description == null) return false
  const text = description.trim()
  return text.length > 0 && text.length < 40
}

export function needsModeration(title: string, description?: string | null): boolean {
  return REVIEW.test(`${title}\n${description ?? ''}`)
}

export function isRally(title: string, description?: string | null): boolean {
  return RALLY.test(`${title}\n${description ?? ''}`)
}

export function statusFromTitle(title: string): 'CANCELLED' | 'POSTPONED' | 'SOLD_OUT' | 'RESCHEDULED' | null {
  const match = title.match(STATUS_WORD)
  if (!match) return null
  const word = match[1].toLowerCase()
  if (word.startsWith('cancel')) return 'CANCELLED'
  if (word.startsWith('postpon')) return 'POSTPONED'
  if (word.startsWith('sold')) return 'SOLD_OUT'
  return 'RESCHEDULED'
}

export function listingModeration(title: string, description?: string | null): { hidden: boolean; moderationStatus: 'review' | 'hidden' | 'approved' } {
  if (needsModeration(title, description) || isRally(title, description)) return { hidden: true, moderationStatus: 'review' }
  if (junkTitle(title) || junkDescription(description) || OFF_BOARD.test(title)) return { hidden: true, moderationStatus: 'hidden' }
  return { hidden: false, moderationStatus: 'approved' }
}

export function fakePublicUrl(url?: string | null): boolean {
  if (!url) return false
  try {
    const host = new URL(url).hostname.toLowerCase()
    return FAKE_PAGE.test(host) || FAKE_IMAGE.test(host)
  } catch {
    return false
  }
}
