import type { EventInsight } from '@/lib/event-insight'

/** Listing summary. It is not added to the event structured data. */
export function EventInsightPanel({ insight }: { insight: EventInsight | null | undefined }) {
  if (!insight?.sentences?.length) return null
  return (
    <section aria-labelledby="event-insight-heading">
      <h2 id="event-insight-heading" className="font-display font-semibold text-base mb-1">{insight.heading}</h2>
      <p className="text-xs text-muted-foreground mb-2">{insight.disclaimer}</p>
      {insight.rewrite && (
        <p className="text-sm leading-relaxed mb-2">{insight.rewrite}</p>
      )}
      <ul className="space-y-1.5 text-sm text-muted-foreground leading-relaxed list-disc pl-5">
        {insight.sentences.map((line) => <li key={line}>{line}</li>)}
      </ul>
      {insight.match && <p className="mt-2 text-sm">{insight.match}</p>}
      <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
        {insight.sources.map((source) => (
          <li key={source.kind}>
            {source.url
              ? <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{source.label}</a>
              : source.label}
          </li>
        ))}
      </ul>
    </section>
  )
}
