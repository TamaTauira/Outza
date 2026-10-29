/** Client-safe referral source constants. */
export const REFERRAL_SOURCES = ['OUTZA', 'SEARCH', 'SOCIAL', 'EMAIL', 'DIRECT', 'OTHER'] as const
export type ReferralSource = (typeof REFERRAL_SOURCES)[number]

export const REFERRAL_LABELS: Record<ReferralSource, string> = {
  OUTZA: 'Browsing VibePeep', SEARCH: 'Search engines', SOCIAL: 'Social media', EMAIL: 'Email & newsletters', DIRECT: 'Direct / links', OTHER: 'Other websites',
}
