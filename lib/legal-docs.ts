/** Versions of the public legal pages. The archive keeps the text from before 18 November 2026. */

export const PROMOTER_TERMS_VERSION = '2026-11-18'

export type LegalDocId = 'terms' | 'privacy' | 'disclaimer' | 'promoter'

export type LegalDoc = {
  id: LegalDocId
  title: string
  version: string
  updated: string
  path: string
}

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  terms: { id: 'terms', title: 'Terms of use', version: '2026-11-18', updated: '18 November 2026', path: '/terms' },
  privacy: { id: 'privacy', title: 'Privacy policy', version: '2026-11-18', updated: '18 November 2026', path: '/privacy' },
  disclaimer: { id: 'disclaimer', title: 'Disclaimer', version: '2026-11-18', updated: '18 November 2026', path: '/disclaimer' },
  promoter: { id: 'promoter', title: 'Promoter & Advertising Terms', version: PROMOTER_TERMS_VERSION, updated: '18 November 2026', path: '/terms/promoters' },
}

/** Text that was on the site before this version. Stable archive URLs. */
export const LEGAL_ARCHIVE: { id: LegalDocId; title: string; version: string; updated: string; path: string }[] = [
  { id: 'terms', title: 'Terms of use', version: '2026-11-01', updated: 'Before 18 November 2026', path: '/legal/archive/terms/2026-11-01' },
  { id: 'privacy', title: 'Privacy policy', version: '2026-11-01', updated: 'Before 18 November 2026', path: '/legal/archive/privacy/2026-11-01' },
  { id: 'disclaimer', title: 'Disclaimer', version: '2026-11-01', updated: 'Before 18 November 2026', path: '/legal/archive/disclaimer/2026-11-01' },
]

export const CONSUMER_DOC_IDS: LegalDocId[] = ['terms', 'privacy', 'disclaimer']

export type AcceptanceNeed = { doc: LegalDocId; version: string }

export function consumerAcceptance(): AcceptanceNeed[] {
  return CONSUMER_DOC_IDS.map((id) => ({ doc: id, version: LEGAL_DOCS[id].version }))
}

export function promoterAcceptance(): AcceptanceNeed {
  return { doc: 'promoter', version: LEGAL_DOCS.promoter.version }
}

export function requiredAcceptance(role: string | null | undefined): AcceptanceNeed[] {
  const docs = consumerAcceptance()
  if (role === 'PROMOTER' || role === 'ADMIN') docs.push(promoterAcceptance())
  return docs
}

export function missingAcceptance(have: { doc: string; version: string }[], need: AcceptanceNeed[]): AcceptanceNeed[] {
  return need.filter((item) => !have.some((row) => row.doc === item.doc && row.version === item.version))
}

/** Checkout must send an explicit tick. A missing or false value is not acceptance. */
export function checkoutTermsError(agree: unknown): string | null {
  if (agree === true) return null
  return 'Tick that you agree to the Promoter Terms before paying.'
}

export function signupTermsError(role: string, agreePromoter: unknown): string | null {
  if (role !== 'PROMOTER') return null
  if (agreePromoter === true) return null
  return 'Tick that you agree to the Promoter Terms.'
}
