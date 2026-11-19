import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import { getBoardFeed } from '@/lib/board-feed'
import { CITY_NAMES, cityDef, DEFAULT_CITY } from '@/lib/cities'
import { cityToday, eventPath } from '@/lib/seo'
import { boardClockLine } from '@/lib/listing-window'
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
        if (relaxed) {
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
      <main className="vp-wrap px-4 py-8 sm:px-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">Search</h1>
        <p className="mt-2 max-w-xl text-muted-foreground">This page keeps the search in the link, so you can send it.</p>
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
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {events.map((event) => {
            const when = boardClockLine(event) || 'Time not listed'
            const place = [event.venueName, event.suburb].filter(Boolean).join(' · ')
            return (
              <li key={event.id} className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-2 px-3 py-3">
                <span className="text-sm tabular-nums text-muted-foreground">{when}</span>
                <Link href={eventPath(event)} className="min-w-0">
                  <span className="line-clamp-2 font-semibold">{event.title}</span>
                  {place && <span className="block truncate text-sm text-muted-foreground">{place}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </main>
    </PageShell>
  )
}
