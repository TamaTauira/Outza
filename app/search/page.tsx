import type { Metadata } from 'next'
import Link from 'next/link'
import { Page } from '@/components/layout/page'
import { PageHeader } from '@/components/layout/page-header'
import { PageShell } from '@/components/page-shell'
import { getBoardFeed } from '@/lib/board-feed'
import { COPY } from '@/lib/copy'
import { boardDisplayName, CITY_NAMES, cityDef, DEFAULT_CITY } from '@/lib/cities'
import { cityToday } from '@/lib/seo'
import { EventCardRow } from '@/components/event-card'
import { SearchPageForm } from '@/components/search-page-form'
import { Button } from '@/components/ui/button'
import { Surface } from '@/components/ui/surface'
import { hintsFromParams, pickedHints } from '@/lib/search-hints'
import { relaxedSearchArgs, searchFeedArgs } from '@/lib/search-feed'
import { pageMeta } from '@/lib/page-meta'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = pageMeta({
  title: 'Search',
  description: 'Search what’s on. The link keeps the words, the city and the dates.',
  path: '/search',
})

type Props = { searchParams: Promise<{ q?: string; city?: string; when?: string; budget?: string; vibe?: string; suburb?: string }> }

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams
  const q = (sp.q ?? '').trim().slice(0, 200)
  const hints = hintsFromParams(sp)
  const requested = sp.city && CITY_NAMES.includes(sp.city) ? sp.city : ''
  const cityName = requested || DEFAULT_CITY
  const today = cityToday(cityDef(cityName))
  const hasPicks = pickedHints(hints)
  let note = ''
  let events: Awaited<ReturnType<typeof getBoardFeed>>['events'] = []
  if (q || hasPicks) {
    try {
      let args = searchFeedArgs(q, cityName, today, hints)
      let feed = await getBoardFeed(args)
      if (feed.events.length === 0) {
        const relaxed = relaxedSearchArgs(args)
        // A nonsense query stays empty. Widening by dropping the words hid the miss.
        if (relaxed && !/wider list/i.test(relaxed.note)) {
          args = relaxed.args
          note = relaxed.note
          feed = await getBoardFeed(args)
        }
      }
      events = feed.events
    } catch {
      note = 'Search is busy. Try again in a moment.'
    }
  }

  return (
    <PageShell>
      <main>
      <Page className="pb-8">
        <PageHeader title="Search" lede="Search what’s on. The link keeps your words, so you can send it." />
        <SearchPageForm city={cityName} query={q} hints={hints} />
        {(q || hasPicks) && events.length > 0 && (
          <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
            {`${events.length} ${events.length === 1 ? 'event' : 'events'} in ${boardDisplayName(cityName)}.`}
            {note ? ` ${note}` : ''}
          </p>
        )}
        {!q && !hasPicks && (
          <p className="mt-4 text-sm text-muted-foreground">Try a word, a night, or a budget. The link keeps what you picked.</p>
        )}
        {(q || hasPicks) && events.length === 0 && (
          <Surface tone="dashed" pad="lg" className="mt-6">
            <p className="font-display text-h3">Nothing matched those words.</p>
            <p className="mt-1 text-sm text-muted-foreground">Try a suburb, a kind of night, or a shorter phrase.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild><Link href="/">{COPY.browse}</Link></Button>
              <Button variant="outline" asChild><Link href={`/search?city=${encodeURIComponent(cityName)}`}>{COPY.startFresh}</Link></Button>
            </div>
          </Surface>
        )}
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-card border border-border bg-card shadow-vp-sm">
          {events.map((event) => (
            <li key={event.id}>
              <EventCardRow event={event} />
            </li>
          ))}
        </ul>
      </Page>
      </main>
    </PageShell>
  )
}
