/** Client-safe constants for data quality, trust and compliance features. */

export const REPORT_REASONS = [
  { key: 'WRONG_DATE', label: 'Wrong date or time' },
  { key: 'WRONG_VENUE', label: 'Wrong venue or address' },
  { key: 'WRONG_PRICE', label: 'Wrong price' },
  { key: 'CANCELLED', label: 'Cancelled or postponed' },
  { key: 'DUPLICATE', label: 'Duplicate listing' },
  { key: 'BROKEN_LINK', label: 'Ticket or website link broken' },
  { key: 'UNSAFE', label: 'Unsafe or fraudulent' },
  { key: 'PRIVACY', label: 'Shows a child or a precise school address' },
  { key: 'OTHER', label: 'Something else' },
] as const
export type ReportReason = (typeof REPORT_REASONS)[number]['key']
export const reportReasonLabel = (k: string) => REPORT_REASONS.find((r) => r.key === k)?.label ?? k

export type PermissionStatus = 'CONFIRMED' | 'TERMS_ONLY' | 'NEEDS_REVIEW'

/**
 * Reuse-permission register for each data provider. This is an internal checklist, not legal advice:
 * statuses stay NEEDS_REVIEW until the owner has confirmed the provider's terms (or a written licence) covers
 * how VibePeep uses that provider's event data and images.
 */
export const PROVIDER_POLICY: Record<string, {
  name: string
  access: string
  termsUrl?: string
  data: PermissionStatus
  images: PermissionStatus
  obligations: string[]
  toConfirm: string
}> = {
  promoter: {
    name: 'Organisers (submitted on VibePeep)', access: 'Submitted by the organiser through the promoter dashboard',
    data: 'CONFIRMED', images: 'CONFIRMED',
    obligations: ['Organiser warrants they may share the content', 'Remove on request'],
    toConfirm: 'Covered by the organiser’s submission; keep the submission terms current.',
  },
  curated: {
    name: 'Official schedules (curated regulars)', access: 'Facts (name, dates, venue) checked against the official website',
    data: 'TERMS_ONLY', images: 'NEEDS_REVIEW',
    obligations: ['Link to the official website', 'Do not copy long descriptions verbatim'],
    toConfirm: 'Ask each venue or market for permission before showing its photos.',
  },
  cityofsydney: {
    name: 'City of Sydney', access: 'Public What’s On listings', termsUrl: 'https://www.cityofsydney.nsw.gov.au/',
    data: 'NEEDS_REVIEW', images: 'NEEDS_REVIEW',
    obligations: ['Attribute City of Sydney', 'Link back to the original listing'],
    toConfirm: 'Confirm the licence for What’s On data and image reuse (some council content is CC BY, images often are not).',
  },
  ticketmaster: {
    name: 'Ticketmaster', access: 'Discovery API', termsUrl: 'https://developer.ticketmaster.com/support/terms-of-use/',
    data: 'TERMS_ONLY', images: 'TERMS_ONLY',
    obligations: ['Link to Ticketmaster for purchase', 'Do not alter event images', 'Do not imply live availability'],
    toConfirm: 'Re-check API terms on attribution, caching period and commercial use with paid placements.',
  },
  eventbrite: {
    name: 'Eventbrite', access: 'Public event pages / API', termsUrl: 'https://www.eventbrite.com/platform/api-terms',
    data: 'NEEDS_REVIEW', images: 'NEEDS_REVIEW',
    obligations: ['Link to the Eventbrite listing', 'Attribute the organiser'],
    toConfirm: 'Confirm API terms allow display on a third-party discovery site with advertising.',
  },
  humanitix: {
    name: 'Humanitix', access: 'Public event pages', termsUrl: 'https://humanitix.com/au/terms',
    data: 'NEEDS_REVIEW', images: 'NEEDS_REVIEW',
    obligations: ['Link to the Humanitix listing'],
    toConfirm: 'Request written permission or a partner feed before relying on this source.',
  },
  moshtix: {
    name: 'Moshtix', access: 'Official open API (public events only)', termsUrl: 'https://developer.moshtix.com/',
    data: 'TERMS_ONLY', images: 'NEEDS_REVIEW',
    obligations: ['Link to the Moshtix listing for tickets', 'Do not imply live availability', 'Avoid heavy polling (one run per refresh)'],
    toConfirm: 'Re-check the Moshtix API terms of use for display on a site with paid placements, and image reuse.',
  },
  oztix: {
    name: 'Oztix', access: 'Public event guide search used by oztix.com.au', termsUrl: 'https://www.oztix.com.au/',
    data: 'NEEDS_REVIEW', images: 'NEEDS_REVIEW',
    obligations: ['Link to the Oztix listing for tickets', 'Do not imply live availability'],
    toConfirm: 'Request written permission or a partner feed from Oztix before relying on this source.',
  },
  ticketek: {
    name: 'Ticketek', access: 'Licensed feed only (impact.com affiliate catalog or Ticketek partner API); off until approved', termsUrl: 'https://premier.ticketek.com.au/',
    data: 'NEEDS_REVIEW', images: 'NEEDS_REVIEW',
    obligations: ['Never scrape or bypass blocks on the Ticketek website', 'Use the affiliate tracking link for ticket clicks and label it', 'Images only if the licence allows (TICKETEK_IMAGES_ALLOWED)', 'Do not imply live availability'],
    toConfirm: 'Apply to the Ticketek affiliate program on impact.com (catalog + tracking links) and/or Ticketek’s partner team for an event API, then add the credentials to switch the source on.',
  },
  frontier: {
    name: 'Frontier Touring', access: 'Public tour listings', termsUrl: 'https://www.frontiertouring.com/',
    data: 'NEEDS_REVIEW', images: 'NEEDS_REVIEW',
    obligations: ['Link to the official tour page', 'Use artwork unaltered'],
    toConfirm: 'Request permission for tour artwork and listing reuse.',
  },
}

export const PERMISSION_LABEL: Record<PermissionStatus, string> = {
  CONFIRMED: 'Confirmed',
  TERMS_ONLY: 'Allowed by published terms (re-check)',
  NEEDS_REVIEW: 'Needs review',
}

/** Exactly what VibePeep measures for organiser analytics. Anything not listed here is not collected for analytics. */
export const ANALYTICS_DATA = [
  { metric: 'Event page views', detail: 'A counter per event; search-engine crawlers are not counted. Views by signed-in people also feed grouped audience insights, never shown individually.' },
  { metric: 'Ticket link clicks', detail: 'A counter per event when someone taps “Get tickets”.' },
  { metric: 'Saves and “going”', detail: 'Totals per event. Organisers never see who saved or is going.' },
  { metric: 'Shares and itinerary adds', detail: 'Totals per event when someone shares a listing or adds it to their itinerary. Organisers never see who.' },
  { metric: 'Audience insights', detail: 'Grouped percentages only: age bands, broad home areas, other interests and how far ahead people plan, plus the organiser’s most saved, shared and itinerary-added events. Built from signed-in adults on VibePeep. Under-18s are excluded. This is interest, not ticket purchases, as VibePeep doesn’t sell tickets. Any group under 10 people is hidden; years of birth, postcodes, names and emails are never shown.' },
  { metric: 'Promotion impressions and clicks', detail: 'Totals per sponsored placement, used to report campaign results.' },
  { metric: 'Newsletter clicks', detail: 'Totals per event and section. Individual subscribers are never shared with organisers.' },
]
