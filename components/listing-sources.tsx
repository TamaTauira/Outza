import type { ListingProvenance } from '@/lib/listing-provenance'

function when(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** Extra source detail for the event page. Event cards do not use this. */
export function ListingSources({ provenance }: { provenance: ListingProvenance }) {
  const checked = when(provenance.lastChecked)
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground">Where this listing comes from</summary>
      <div className="mt-2 space-y-1.5 leading-relaxed">
        <p>
          Original source: {provenance.sourceUrl
            ? <a href={provenance.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{provenance.sourceLabel}</a>
            : provenance.sourceLabel}
          {checked ? ` · Last checked ${checked}` : ' · No check time stored yet'}
        </p>
        {provenance.organiserName && <p>Organiser on the listing: {provenance.organiserName}</p>}
        {provenance.venueName && <p>Venue: {provenance.venueName}</p>}
        {provenance.otherSources.length > 0 && <p>Also seen on {provenance.otherSources.join(', ')}. Those copies are kept on this one listing.</p>}
        {provenance.organiserNote && <p>{provenance.organiserNote}</p>}
        {provenance.statusNote && <p>{provenance.statusNote}</p>}
        <p>{provenance.checkNote}</p>
      </div>
    </details>
  )
}
