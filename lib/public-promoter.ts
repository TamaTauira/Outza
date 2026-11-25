/**
 * Who may appear on the public promoter directory and organiser page.
 * Test, QA and unpublished accounts stay out. A personal name with no
 * organisation profile stays out. This does not change stored rows.
 */

const TEST_LABEL = /\b(qa|q\.a\.|test|probe|viewport|placeholder|dummy|sample)\b|partner check|legal check|please ignore/i
const TEST_EMAIL = /(?:^|[.+_-])(?:qa|test|probe)(?:$|[.+_@-])|@example\.(?:com|org|net)$|mailinator|yopmail/i

export function publicListingFilter() {
  return {
    hidden: false,
    deletedAt: null,
    duplicateOfId: null,
    status: { not: 'CANCELLED' as const },
    OR: [
      { moderationStatus: null },
      { moderationStatus: { notIn: ['review', 'hidden'] } },
    ],
  }
}

export function isTestPromoterLabel(value: string | null | undefined): boolean {
  const text = (value ?? '').trim()
  if (!text) return false
  return TEST_LABEL.test(text)
}

export function isTestPromoterEmail(value: string | null | undefined): boolean {
  const text = (value ?? '').trim().toLowerCase()
  if (!text) return false
  return TEST_EMAIL.test(text)
}

/** A directory row needs an organisation name, a published listing, and no test markers. */
export function isPublicPromoterProfile(input: {
  orgName: string | null | undefined
  name?: string | null
  email?: string | null
  publishedListings: number
}): boolean {
  const org = (input.orgName ?? '').trim()
  if (!org) return false
  if (input.publishedListings < 1) return false
  if (isTestPromoterLabel(org) || isTestPromoterLabel(input.name)) return false
  if (isTestPromoterEmail(input.email)) return false
  return true
}
