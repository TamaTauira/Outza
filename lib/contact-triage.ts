export const CONTACT_CATEGORIES = [
  'listing fix',
  'account/login',
  'purchase/refund',
  'accessibility',
  'partnership/ads',
  'press',
  'spam',
  'feature request',
  'other',
] as const

export type ContactCategory = (typeof CONTACT_CATEGORIES)[number]
export type ContactUrgency = 'low' | 'normal' | 'high'
export type ContactStatus = 'NEW' | 'AUTO_ANSWERED' | 'DRAFTED' | 'ESCALATED' | 'CLOSED'

export type ContactTriage = {
  category: ContactCategory
  urgency: ContactUrgency
  status: ContactStatus
  summary: string
  draftReply: string | null
}

const SPAM = /\b(viagra|casino|seo services|crypto airdrop|buy followers|guest post)\b/i
const LISTING = /\b(wrong date|wrong time|wrong venue|cancelled|canceled|postponed|broken link|this listing|this event)\b/i
const ACCOUNT = /\b(password|log ?in|sign ?in|account|verify|verification)\b/i
const PURCHASE = /\b(refund|payment|charged|invoice|card|subscription|receipt)\b/i
const ACCESS = /\b(accessib|wheelchair|screen reader|disability|can’t get in|can't get in)\b/i
const PARTNER = /\b(sponsor|advertis|partner|promote my)\b/i
const PRESS = /\b(journalist|press|interview|media outlet)\b/i
const FEATURE = /\b(feature request|suggestion|would be (nice|good)|you should add|idea)\b/i
const LEGAL = /\b(lawyer|solicitor|privacy act|delete my data|gdpr|not happy with the terms)\b/i

export function extractEventId(message: string): string | null {
  const match = message.match(/\/events\/([a-z0-9]{8,40})/i)
  return match ? match[1] : null
}

function clip(value: string, max: number): string {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`
}

/** Rule sort used on every contact message. AI may refine the category later; it cannot send mail. */
export function triageContact(input: { topic: string; message: string }): ContactTriage {
  const text = `${input.topic}\n${input.message}`
  let category: ContactCategory = CONTACT_CATEGORIES.includes(input.topic as ContactCategory)
    ? input.topic as ContactCategory
    : 'other'
  if (category === 'other') {
    if (SPAM.test(text)) category = 'spam'
    else if (LISTING.test(text) || input.topic === 'Listing') category = 'listing fix'
    else if (PURCHASE.test(text) || input.topic === 'Purchase') category = 'purchase/refund'
    else if (ACCESS.test(text) || input.topic === 'Accessibility') category = 'accessibility'
    else if (PARTNER.test(text)) category = 'partnership/ads'
    else if (PRESS.test(text)) category = 'press'
    else if (ACCOUNT.test(text) || input.topic === 'Account') category = 'account/login'
    else if (FEATURE.test(text)) category = 'feature request'
  }

  const urgent = category === 'purchase/refund' || category === 'accessibility' || category === 'press' || LEGAL.test(text)
  const urgency: ContactUrgency = category === 'spam' ? 'low' : urgent ? 'high' : 'normal'
  const summary = clip(`${category}: ${input.message}`, 240)

  if (category === 'spam') {
    return { category, urgency, status: 'CLOSED', summary, draftReply: null }
  }
  if (category === 'listing fix') {
    return {
      category,
      urgency,
      status: 'ESCALATED',
      summary,
      draftReply: 'Listing note stored for the trust queue. No customer reply was sent.',
    }
  }
  if (category === 'purchase/refund' || category === 'accessibility' || category === 'press' || category === 'partnership/ads' || LEGAL.test(text)) {
    return {
      category,
      urgency: 'high',
      status: 'ESCALATED',
      summary,
      draftReply: 'Needs a person. No acknowledgement was sent. Reply from the Gmail thread if it needs an answer.',
    }
  }
  return {
    category,
    urgency,
    status: 'DRAFTED',
    summary,
    draftReply: 'Sorted on the site. No automatic reply is approved.',
  }
}

export function coerceTriage(raw: unknown, fallback: ContactTriage): ContactTriage {
  if (!raw || typeof raw !== 'object') return fallback
  const row = raw as { category?: unknown; urgency?: unknown; summary?: unknown }
  const category = CONTACT_CATEGORIES.includes(row.category as ContactCategory) ? row.category as ContactCategory : fallback.category
  const urgency: ContactUrgency = row.urgency === 'low' || row.urgency === 'high' || row.urgency === 'normal' ? row.urgency : fallback.urgency
  const summary = typeof row.summary === 'string' && row.summary.trim() ? clip(row.summary, 240) : fallback.summary
  return triageContact({ topic: category, message: summary })
}
