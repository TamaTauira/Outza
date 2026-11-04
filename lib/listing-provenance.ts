/**
 * Public source line for an event page. Cards stay as they are.
 * "Updated by organiser" is the label. The word verified is not used.
 */
import { filledSourceNote } from '@/lib/linked-fill'
import { sourceLabel } from '@/lib/quality'
import { reportedStatusNote, sourceOutageSentence } from '@/lib/listing-freshness'

const FIELD_LABEL: Record<string, string> = {
  title: 'the name',
  description: 'the description',
  date: 'the date',
  time: 'the start time',
  endTime: 'the finish time',
  venueName: 'the venue',
  venueAddress: 'the address',
  status: 'the status',
  price: 'the price',
  category: 'the category',
}

export type ListingProvenance = {
  sourceLabel: string
  sourceUrl: string | null
  organiserName: string | null
  venueName: string | null
  lastChecked: string | null
  checkNote: string
  otherSources: string[]
  organiserFields: string[]
  organiserNote: string | null
  statusNote: string | null
  filledNote: string | null
}

function httpUrl(value: string | null | undefined): string | null {
  if (!value || !/^https?:\/\//i.test(value)) return null
  return value
}

export function listingProvenance(input: {
  source?: string | null
  sourceUrl?: string | null
  organiserUrl?: string | null
  ticketUrl?: string | null
  organiserName?: string | null
  venueName?: string | null
  lastVerifiedAt?: Date | string | null
  updatedAt?: Date | string | null
  sources?: string[] | null
  organiserFields?: string[] | null
  status?: string | null
  statusSource?: string | null
  fieldSources?: Record<string, string> | null
}): ListingProvenance {
  const primary = sourceLabel(input.source).replace(/\bverified\b/ig, '').replace(/\s{2,}/g, ' ').trim() || 'a listing site'
  const link = httpUrl(input.sourceUrl) || httpUrl(input.organiserUrl) || httpUrl(input.ticketUrl)
  const checked = input.lastVerifiedAt ?? input.updatedAt
  const lastChecked = checked ? new Date(checked).toISOString() : null
  const others = [...new Set((input.sources ?? []).filter((item) => item && item !== input.source))].map((item) => sourceLabel(item))
  const fields = (input.organiserFields ?? []).map((field) => FIELD_LABEL[field] ?? field.replace(/([A-Z])/g, ' $1').toLowerCase())
  const organiserNote = fields.length
    ? `Updated by organiser (${fields.join(', ')}). Some event details were updated directly in VibePeep and may differ from the original event source.`
    : null
  return {
    sourceLabel: primary,
    sourceUrl: link,
    organiserName: input.organiserName?.trim() || null,
    venueName: input.venueName?.trim() || null,
    lastChecked,
    checkNote: `Listings are re-checked on a schedule. This time is the last check we have stored, not a live ticket check. ${sourceOutageSentence()}`,
    otherSources: others,
    organiserFields: fields,
    organiserNote,
    statusNote: reportedStatusNote(input.status, input.statusSource ? sourceLabel(input.statusSource) : null),
    filledNote: filledSourceNote(input.source, input.fieldSources),
  }
}
