/** Plain hours line from fields the venue actually saved. */
export function venueHoursLine(venue: { openTime?: string | null; closeTime?: string | null; hoursNote?: string | null }): string | null {
  const note = venue.hoursNote?.trim() || null
  const span = venue.openTime && venue.closeTime ? `${venue.openTime}–${venue.closeTime}` : null
  if (note && span) return `${note} (${span})`
  if (note) return note
  if (span) return `Open ${span}`
  return null
}
