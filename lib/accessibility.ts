/** Public contact for access barriers. Prefer an env override. There is no separate support inbox in the product, so the fallback is the mailbox VibePeep already sends mail from. */

export const ACCESSIBILITY_UPDATED = '18 November 2026'
export const ACCESSIBILITY_STANDARD = 'WCAG 2.2 Level AA'
export const ACCESSIBILITY_FALLBACK_EMAIL = 'outza.promoter@yahoo.com'

export function accessibilityEmail(): string {
  const fromEnv = process.env.ACCESSIBILITY_EMAIL?.trim() || process.env.CONTACT_EMAIL?.trim()
  return fromEnv || ACCESSIBILITY_FALLBACK_EMAIL
}
