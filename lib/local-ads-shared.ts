/** Client-safe constants for local business recommendations. */
export const LOCAL_AD_KINDS = [
  { key: 'DINING', label: 'Dinner', hint: 'Restaurant or pre-show dining' },
  { key: 'BAR', label: 'Bar', hint: 'Drinks before or after' },
  { key: 'PARKING', label: 'Parking', hint: 'Car park or parking service' },
  { key: 'EXPERIENCE', label: 'Experience', hint: 'Tours, activities, things to do nearby' },
  { key: 'SERVICE', label: 'Service', hint: 'Transport, accommodation and other services' },
] as const
export type LocalAdKind = (typeof LOCAL_AD_KINDS)[number]['key']
export const isLocalAdKind = (k: unknown): k is LocalAdKind => LOCAL_AD_KINDS.some((x) => x.key === k)
export const kindLabel = (k: string) => LOCAL_AD_KINDS.find((x) => x.key === k)?.label ?? 'Local pick'

/** One live recommendation per event. A second purchase is refused so ads cannot stack on the same listing. */
export const MAX_ADS_PER_EVENT = 1
export const LIMITS = { businessName: 60, blurb: 160, address: 120, url: 300 }
