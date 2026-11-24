import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import { ATTRIBUTIONS } from '@/lib/attributions'

export const metadata: Metadata = {
  title: 'Data sources — VibePeep',
  description: 'Third-party data and map tiles used on VibePeep, and the credit each one asks for.',
}

export default function AttributionsPage() {
  return (
    <PageShell>
      <main className="vp-wrap vp-page-top px-4 pb-12 sm:px-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Legal</p>
        <h1 className="mt-2 font-display text-h1">Data sources</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground leading-relaxed">
          VibePeep listings are gathered from public event sources. The figures on Promoter Intelligence, and the map under the pins, come from the publishers below. Each chart on an intelligence report repeats the credit for the dataset it draws.
        </p>
        <ul className="mt-8 max-w-2xl space-y-6">
          {ATTRIBUTIONS.map((row) => (
            <li key={row.name}>
              <h2 className="font-semibold"><a href={row.url} className="underline underline-offset-2" target="_blank" rel="noopener noreferrer">{row.name}</a></h2>
              <p className="mt-1 text-sm text-muted-foreground">{row.usedFor}</p>
              <p className="mt-1 text-sm">{row.credit}{row.licenceUrl ? <> · <a href={row.licenceUrl} className="underline underline-offset-2" target="_blank" rel="noopener noreferrer">{row.licence}</a></> : <> · {row.licence}</>}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-muted-foreground">
          Directions from an event open Google Maps in a new tab. That page is Google’s, and it carries Google’s own credit. We do not draw Google, Mapbox, CARTO or MapTiler tiles.
          {' '}<Link href="/terms" className="underline underline-offset-2">Terms</Link>
        </p>
      </main>
    </PageShell>
  )
}
