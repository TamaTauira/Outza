import type { ListingProvenance } from '@/lib/listing-provenance'
import { formatUpdated } from '@/lib/listing-window'
import { isGenericCouncilLanding, rewriteCouncilListingUrl } from '@/lib/listing-link'

/**
 * One source line for the event page. The venue and the organiser are already
 * on the card, so they are not repeated here.
 */
export function ListingSources({ provenance }: { provenance: ListingProvenance }) {
  const checked = formatUpdated(provenance.lastChecked)
  const sourceHref = rewriteCouncilListingUrl(provenance.sourceUrl)
  const sourceLink = sourceHref && !isGenericCouncilLanding(sourceHref) ? sourceHref : null
  const extras = [
    provenance.otherSources.length > 0
      ? `Also spotted on ${provenance.otherSources.join(', ')}. Those copies sit on this one listing.`
      : null,
    provenance.filledNote,
    provenance.organiserNote,
    provenance.venueNote,
    provenance.statusNote,
  ].filter((line): line is string => !!line)

  return (
    <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
      <p>
        From {sourceLink
          ? <a href={sourceLink} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">{provenance.sourceLabel}</a>
          : provenance.sourceLabel}
        {checked ? ` · Last checked ${checked}` : ''}
        . That&apos;s our last look, not a live ticket check.
      </p>
      {extras.map((line) => <p key={line}>{line}</p>)}
    </div>
  )
}
