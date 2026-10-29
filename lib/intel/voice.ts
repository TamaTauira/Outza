// Promoter-created events and organiser-submitted Local listings can say "your venue".
// Ingested feeds (ticketing sites, councils, claimed listings) stay "the venue" or the venue's name.

/** True only when the listing was created in VibePeep by a promoter or a local organiser. */
export function intelOwnerVoice(source: string | null | undefined): boolean {
  return source === 'promoter' || source === 'local'
}

export type Voice = {
  owned: boolean
  /** "your venue" or "the venue" */
  venue: string
  /** Owned: "your venue". Ingested: the venue's name, or "the venue" when it has none. */
  venueNamed: string
  /** "your listing" or "the listing" */
  listing: string
}

export function voiceFor(owned: boolean, venueName: string | null | undefined): Voice {
  const name = venueName?.trim() || ''
  return {
    owned,
    venue: owned ? 'your venue' : 'the venue',
    venueNamed: owned ? 'your venue' : (name || 'the venue'),
    listing: owned ? 'your listing' : 'the listing',
  }
}
