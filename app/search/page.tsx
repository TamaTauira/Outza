import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import { getBoardFeed } from '@/lib/board-feed'
import { CITY_NAMES, cityDef, DEFAULT_CITY } from '@/lib/cities'
import { cityToday } from '@/lib/seo'
import { EventCardRow } from '@/components/event-card'
import { relaxedSearchArgs, searchFeedArgs } from '@/lib/search-feed'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Search · VibePeep',
  description: 'Search what’s on. The link keeps the words, the city and the dates.',
}

type Props = { searchParams: Promise<{ q?: string; city?: string }> }

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams
  const q = (sp.q ?? '').trim().slice(0, 200)
  const requested = sp.city && CITY_NAMES.includes(sp.city) ? sp.city : ''
  const cityName = requested || DEFAULT_CITY
  const today = cityToday(cityDef(cityName))
  let note = ''
  let events: Awaited<ReturnType<typeof getBoardFeed>>['events'] = []
  if (q) {
    try {
      let args = searchFeedArgs(q, cityName, today)
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
      <main className="vp-wrap vp-page-top px-4 pb-8 sm:px-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">Search</h1>
        <p className="mt-2 max-w-xl text-muted-foreground">Search what’s on. The link keeps your words, so you can send it.</p>
        <form role="search" action="/search" method="get" className="mt-6 flex max-w-3xl flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="search-q">Search events</label>
          <input
            id="search-q"
            name="q"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            defaultValue={q}
            placeholder='Try "jazz this Friday"'
            className="h-14 min-w-0 flex-1 rounded-full border border-input bg-card px-5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input type="hidden" name="city" value={cityName} />
          <button type="submit" className="h-14 rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground">Find events</button>
        </form>
        {q && (
          <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
            {events.length === 0 ? 'Nothing matched that yet.' : `${events.length} ${events.length === 1 ? 'event' : 'events'} in ${cityName}.`}
            {note ? ` ${note}` : ''}
          </p>
        )}
        {q && events.length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-6">
            <p className="font-display text-lg font-bold">Nothing matched those words.</p>
            <p className="mt-1 text-sm text-muted-foreground">Try a suburb, a kind of night, or a shorter phrase.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/" className="inline-flex h-11 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">Browse what’s on</Link>
              <Link href={`/search?city=${encodeURIComponent(cityName)}`} className="inline-flex h-11 items-center rounded-full border border-border px-4 text-sm font-semibold">Clear search</Link>
            </div>
          </div>
        )}
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {events.map((event) => (
            <li key={event.id}>
              <EventCardRow event={event} />
            </li>
          ))}
        </ul>
      </main>
    </PageShell>
  )
}
