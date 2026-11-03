export const EDITIONS = ['today', 'tonight', 'weekend'] as const
export type Edition = (typeof EDITIONS)[number]

export const EDITION_LABEL: Record<Edition, string> = {
  today: "What's happening today",
  tonight: "Tonight's highlights",
  weekend: 'This weekend',
}

export function isEdition(value: unknown): value is Edition {
  return value === 'today' || value === 'tonight' || value === 'weekend'
}
