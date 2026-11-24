import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusLabel, type StatusTone } from '@/components/ui/status-label'
import type { PartnerList, PartnerOverview, PartnerStat } from '@/lib/partner-data'
import {
  PARTNER_PAGE_SIZE,
  STATUS_OPTIONS,
  filtersToQuery,
  type PartnerFilters,
  type PartnerSort,
} from '@/lib/partner-scope'

const TONE: Record<string, StatusTone> = {
  board: 'live',
  past: 'past',
  cancelled: 'cancelled',
  removed: 'rejected',
  sold_out: 'soldOut',
  postponed: 'postponed',
  rescheduled: 'postponed',
  hidden: 'pending',
  duplicate: 'pending',
  review: 'pending',
}

function n(value: number): string {
  return value.toLocaleString('en-AU')
}

function when(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function fieldClass() {
  return 'h-11 w-full rounded-[var(--vp-radius-md)] border border-input bg-background px-3 text-sm'
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function Breakdown({ title, rows, empty }: { title: string; rows: PartnerStat[]; empty: string }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="font-semibold">{title}</h3>
      {rows.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{empty}</p> : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 font-medium">Name</th>
              <th className="py-1 text-right font-medium">Events</th>
              <th className="py-1 text-right font-medium">Views</th>
              <th className="py-1 text-right font-medium">Get tickets</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-border">
                <td className="py-1.5 pr-2">{row.label}</td>
                <td className="py-1.5 text-right tabular-nums">{n(row.events)}</td>
                <td className="py-1.5 text-right tabular-nums">{n(row.views)}</td>
                <td className="py-1.5 text-right tabular-nums">{n(row.tickets)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export function PartnerView({ overview, list, filters }: { overview: PartnerOverview; list: PartnerList; filters: PartnerFilters }) {
  const query = (next: Partial<PartnerFilters>, page = 1) => `/partners${filtersToQuery({ ...filters, ...next, page })}`
  const sortHref = (sort: PartnerSort) => query({ sort, dir: filters.sort === sort && filters.dir === 'desc' ? 'asc' : 'desc' })
  const exportHref = `/api/partners/export${filtersToQuery({ ...filters, page: 1 })}`
  const start = list.total === 0 ? 0 : (list.page - 1) * PARTNER_PAGE_SIZE + 1
  const end = Math.min(list.total, list.page * PARTNER_PAGE_SIZE)
  const sourceLine = overview.sources.map((source) => source.label).join(', ') || 'No source assigned'

  return (
    <main className="vp-wrap vp-page-top px-4 pb-24 sm:px-6">
      <p className="text-sm font-semibold text-primary">Source partner</p>
      <h1 className="mt-1 font-display text-h1">{overview.displayName}</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Every listing VibePeep stored from {sourceLine}. This login is read-only. Event owners still claim a single listing on their own.
      </p>

      <section className="mt-6 rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="sourced-total">
        <p id="sourced-total" className="text-sm font-semibold text-muted-foreground">Events sourced</p>
        <p className="mt-1 font-display text-5xl font-bold tabular-nums tracking-tight">{n(overview.total)}</p>
        <p className="mt-2 text-sm text-muted-foreground">Upcoming, past, hidden and in review. This total is not filtered.</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><dt className="text-xs text-muted-foreground">On the board</dt><dd className="text-lg font-semibold tabular-nums">{n(overview.onBoard)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Past</dt><dd className="text-lg font-semibold tabular-nums">{n(overview.past)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Hidden</dt><dd className="text-lg font-semibold tabular-nums">{n(overview.hidden)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Claimed by an owner</dt><dd className="text-lg font-semibold tabular-nums">{n(overview.claimed)}</dd></div>
        </dl>
      </section>

      <section className="mt-8" aria-labelledby="all-events">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="all-events" className="font-display text-2xl font-bold">All events</h2>
            <p className="mt-1 text-sm text-muted-foreground">{n(list.total)} in this filtered list. {start === 0 ? 'None to show.' : `Showing ${n(start)}–${n(end)}.`}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href={exportHref}>Download CSV</a>
          </Button>
        </div>

        <form method="get" action="/partners" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Search</span>
            <input name="q" defaultValue={filters.q} placeholder="Title, venue, suburb or city" className={fieldClass()} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">City</span>
            <select name="city" defaultValue={filters.city} className={fieldClass()}>
              <option value="">All cities</option>
              {list.cities.map((city) => <option key={city} value={city}>{city}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Category</span>
            <select name="category" defaultValue={filters.category} className={fieldClass()}>
              <option value="">All categories</option>
              {list.categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Status</span>
            <select name="status" defaultValue={filters.status} className={fieldClass()}>
              {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Price</span>
            <select name="price" defaultValue={filters.price} className={fieldClass()}>
              <option value="any">Any price</option>
              <option value="tba">Price TBA</option>
              <option value="free">Free</option>
              <option value="priced">Priced</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Claimed by an owner</span>
            <select name="claimed" defaultValue={filters.claimed} className={fieldClass()}>
              <option value="any">Claimed or not</option>
              <option value="yes">Claimed</option>
              <option value="no">Not claimed</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Starts from</span>
            <input type="date" name="from" defaultValue={filters.from} className={fieldClass()} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Starts to</span>
            <input type="date" name="to" defaultValue={filters.to} className={fieldClass()} />
          </label>
          {filters.sort !== 'date' ? <input type="hidden" name="sort" value={filters.sort} /> : null}
          {filters.dir !== 'desc' ? <input type="hidden" name="dir" value={filters.dir} /> : null}
          {filters.engagement !== '28' ? <input type="hidden" name="engagement" value={filters.engagement} /> : null}
          <div className="flex items-end gap-2">
            <Button type="submit" className="h-11">Apply</Button>
            <Button asChild variant="ghost" className="h-11"><Link href="/partners">Clear</Link></Button>
          </div>
        </form>

        {list.rows.length === 0 ? (
          <EmptyState className="mt-6 rounded-xl border border-border bg-card" title="No listings in this filter" body="Try another city, status or date. The sourced total above still counts every listing from your source." />
        ) : (
          <>
            <ul className="mt-4 space-y-3 md:hidden">
              {list.rows.map((row) => (
                <li key={row.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap gap-1.5">{row.badges.map((badge) => <StatusLabel key={badge.key} tone={TONE[badge.key] ?? 'pending'}>{badge.label}</StatusLabel>)}</div>
                  <h3 className="mt-2 font-semibold leading-snug">{row.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{when(row.date)} · {row.city}{row.suburb ? ` · ${row.suburb}` : ''} · {row.category}</p>
                  <p className="text-sm text-muted-foreground">{row.venueName} · {row.price} · {row.claimed ? 'Claimed' : 'Not claimed'}</p>
                  <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                    <div><dt className="text-xs text-muted-foreground">Views</dt><dd className="font-semibold tabular-nums">{n(row.views)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Saves</dt><dd className="font-semibold tabular-nums">{n(row.saves)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Itinerary</dt><dd className="font-semibold tabular-nums">{n(row.itineraryAdds)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Tickets</dt><dd className="font-semibold tabular-nums">{n(row.ticketClicks)}</dd></div>
                  </dl>
                  <p className="mt-2 text-xs text-muted-foreground">Click-through {row.ctr ?? '—'} · {row.sourceLabel}</p>
                  <p className="mt-2 flex flex-wrap gap-3 text-sm">
                    <Link href={row.path} className="font-semibold text-primary hover:underline">On VibePeep</Link>
                    {row.sourceUrl ? <a href={row.sourceUrl} className="font-semibold text-primary hover:underline" rel="noreferrer">Source listing</a> : <span className="text-muted-foreground">No source link</span>}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-4 hidden overflow-x-auto rounded-xl border border-border md:block">
              <table className="w-full min-w-[980px] text-sm">
                <caption className="sr-only">Events from your source, with all-time views, saves, itinerary adds and Get tickets clicks</caption>
                <thead className="bg-muted/60 text-left">
                  <tr>
                    <SortHead label="Event" sort="title" current={filters} href={sortHref('title')} />
                    <SortHead label="Date" sort="date" current={filters} href={sortHref('date')} />
                    <SortHead label="City" sort="city" current={filters} href={sortHref('city')} />
                    <SortHead label="Category" sort="category" current={filters} href={sortHref('category')} />
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Price</th>
                    <th className="px-3 py-2 font-medium">Owner</th>
                    <SortHead label="Views" sort="views" current={filters} href={sortHref('views')} align="right" />
                    <SortHead label="Saves" sort="saves" current={filters} href={sortHref('saves')} align="right" />
                    <SortHead label="Itinerary" sort="itinerary" current={filters} href={sortHref('itinerary')} align="right" />
                    <SortHead label="Tickets" sort="clicks" current={filters} href={sortHref('clicks')} align="right" />
                    <th className="px-3 py-2 font-medium">Links</th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((row) => (
                    <tr key={row.id} className="border-t border-border align-top">
                      <td className="px-3 py-3">
                        <p className="font-semibold">{row.title}</p>
                        <p className="text-xs text-muted-foreground">{row.venueName}</p>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">{when(row.date)}</td>
                      <td className="px-3 py-3">{row.city}{row.suburb ? <span className="block text-xs text-muted-foreground">{row.suburb}</span> : null}</td>
                      <td className="px-3 py-3">{row.category}</td>
                      <td className="px-3 py-3"><div className="flex flex-col items-start gap-1">{row.badges.map((badge) => <StatusLabel key={badge.key} tone={TONE[badge.key] ?? 'pending'}>{badge.label}</StatusLabel>)}</div></td>
                      <td className="px-3 py-3 whitespace-nowrap">{row.price}</td>
                      <td className="px-3 py-3">{row.claimed ? 'Claimed' : 'Not claimed'}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{n(row.views)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{n(row.saves)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{n(row.itineraryAdds)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {n(row.ticketClicks)}
                        <span className="block text-xs text-muted-foreground">{row.ctr ?? '—'}</span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <Link href={row.path} className="font-semibold text-primary hover:underline">VibePeep</Link>
                        {row.sourceUrl ? <a href={row.sourceUrl} className="ml-3 font-semibold text-primary hover:underline" rel="noreferrer">Source</a> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Event pages">
              <p className="text-muted-foreground">Page {n(list.page)} of {n(list.pages)}</p>
              <div className="flex gap-2">
                {list.page > 1 ? <Button asChild variant="outline" size="sm"><Link href={query({}, list.page - 1)}>Previous</Link></Button> : <Button variant="outline" size="sm" disabled>Previous</Button>}
                {list.page < list.pages ? <Button asChild variant="outline" size="sm"><Link href={query({}, list.page + 1)}>Next</Link></Button> : <Button variant="outline" size="sm" disabled>Next</Button>}
              </div>
            </nav>
          </>
        )}
      </section>

      <section className="mt-10" aria-labelledby="traffic">
        <h2 id="traffic" className="font-display text-2xl font-bold">Traffic and clicks</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{overview.historyNote}</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Date range">
          {(['7', '28', '90'] as const).map((days) => (
            <Link key={days} href={query({ engagement: days }, filters.page)} aria-current={filters.engagement === days ? 'true' : undefined}
              className={`inline-flex h-11 items-center rounded-full px-3 text-xs font-semibold ${filters.engagement === days ? 'bg-foreground text-background' : 'bg-muted text-foreground'}`}>
              {days} days
            </Link>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{overview.range.from} to {overview.range.to}, Australia/Sydney dates.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Views in range" value={n(overview.range.views)} hint={`All-time ${n(overview.allTime.views)}`} />
          <Stat label="Saves in range" value={n(overview.range.saves)} hint={`All-time saves ${n(overview.allTime.saves)}`} />
          <Stat label="Get tickets in range" value={n(overview.range.tickets)} hint={`All-time ${n(overview.allTime.tickets)}`} />
          <Stat label="Click-through in range" value={overview.range.ctr ?? '—'} hint={overview.allTime.ctr ? `All-time ${overview.allTime.ctr}` : 'Blank until a listing has views'} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Itinerary adds in range" value={n(overview.range.itinerary)} hint={`All-time ${n(overview.allTime.itinerary)}. Range starts with the current tracking.`} />
          <Stat label="More info in range" value={n(overview.range.info)} hint="Separate from Get tickets. Not backfilled." />
          <Stat label="Shares in range" value={n(overview.range.shares)} hint={`All-time ${n(overview.allTime.shares)}`} />
          <Stat label="Plans and calendars" value={n(overview.range.plans + overview.range.calendar)} hint={`${n(overview.range.plans)} plan adds, ${n(overview.range.calendar)} calendar exports`} />
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold">Daily totals</h3>
            <div className="mt-2 max-h-80 overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-medium">Day</th><th className="py-1 text-right font-medium">Views</th><th className="py-1 text-right font-medium">Get tickets</th></tr></thead>
                <tbody>
                  {overview.series.map((day) => (
                    <tr key={day.day} className="border-t border-border">
                      <td className="py-1">{day.day}</td>
                      <td className="py-1 text-right tabular-nums">{n(day.views)}</td>
                      <td className="py-1 text-right tabular-nums">{n(day.tickets)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold">Where the page was opened</h3>
            <p className="mt-1 text-xs text-muted-foreground">All-time visits to the event page, not the ticket site. Get tickets clicks are the outbound taps.</p>
            {overview.referrals.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No referral totals stored yet.</p> : (
              <ul className="mt-3 space-y-1 text-sm">
                {overview.referrals.map((row) => <li key={row.source} className="flex justify-between gap-3"><span>{row.source}</span><span className="tabular-nums font-semibold">{n(row.count)}</span></li>)}
              </ul>
            )}
            <h3 className="mt-5 font-semibold">Appearances</h3>
            <p className="mt-1 text-xs text-muted-foreground">Times a listing was shown. Counted from this tracking launch, once per browser session per surface.</p>
            {overview.surfaces.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No appearance totals in this range.</p> : (
              <ul className="mt-3 space-y-1 text-sm">
                {overview.surfaces.map((row) => <li key={row.label} className="flex justify-between gap-3"><span>{row.label}</span><span className="tabular-nums font-semibold">{n(row.count)}</span></li>)}
              </ul>
            )}
          </section>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <EventRank title="Most Get tickets clicks" rows={overview.topClicks} metric="clicks" />
          <EventRank title="Most page views" rows={overview.topViews} metric="views" />
        </div>
      </section>

      <section className="mt-10" aria-labelledby="places">
        <h2 id="places" className="font-display text-2xl font-bold">Cities and suburbs</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">These are the places on the listings, with the views and Get tickets clicks those listings collected. Viewer areas below are grouped and only shown from 10 upwards.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <Breakdown title="By city" rows={overview.cities} empty="No city on file." />
          <Breakdown title="By suburb" rows={overview.suburbs} empty="No suburb on file." />
          <Breakdown title="By category" rows={overview.categories} empty="No category on file." />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold">Viewer areas in this range</h3>
            {overview.places.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No area has 10 or more recorded opens in this range.</p> : (
              <ul className="mt-2 space-y-1 text-sm">{overview.places.map((row) => <li key={row.label} className="flex justify-between gap-3"><span>{row.label}</span><span className="tabular-nums font-semibold">{n(row.count)}</span></li>)}</ul>
            )}
          </section>
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold">Search terms in this range</h3>
            <p className="mt-1 text-xs text-muted-foreground">Terms seen fewer than 5 times are left out.</p>
            {overview.terms.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No search term has 5 or more appearances in this range.</p> : (
              <ul className="mt-2 space-y-1 text-sm">{overview.terms.map((row) => <li key={row.term} className="flex justify-between gap-3"><span>{row.term}</span><span className="tabular-nums font-semibold">{n(row.count)}</span></li>)}</ul>
            )}
          </section>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="quality">
        <h2 id="quality" className="font-display text-2xl font-bold">Data quality</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Counts of listings, not of people. A claimed listing has an owner on VibePeep. The owner’s name and email stay off this page.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Price TBA" value={n(overview.priceTba)} />
          <Stat label="Missing image" value={n(overview.missingImage)} />
          <Stat label="Missing ticket link" value={n(overview.missingTicket)} />
          <Stat label="Hidden" value={n(overview.hidden)} />
          <Stat label="In review" value={n(overview.inReview)} />
          <Stat label="Removed" value={n(overview.removed)} />
          <Stat label="Duplicates" value={n(overview.duplicates)} />
          <Stat label="Cancelled" value={n(overview.cancelled)} />
          <Stat label="Claimed by an owner" value={n(overview.claimed)} />
          <Stat label="Open problem reports" value={n(overview.openReports)} />
        </div>
      </section>
    </main>
  )
}

function SortHead({ label, sort, current, href, align = 'left' }: { label: string; sort: PartnerSort; current: PartnerFilters; href: string; align?: 'left' | 'right' }) {
  const on = current.sort === sort
  return (
    <th className={`px-3 py-2 font-medium ${align === 'right' ? 'text-right' : ''}`} aria-sort={on ? (current.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <Link href={href} className="hover:underline">{label}{on ? (current.dir === 'asc' ? ' ↑' : ' ↓') : ''}</Link>
    </th>
  )
}

function EventRank({ title, rows, metric }: { title: string; rows: PartnerList['rows']; metric: 'clicks' | 'views' }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="font-semibold">{title}</h3>
      {rows.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No listings yet.</p> : (
        <ol className="mt-3 space-y-2 text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3">
              <Link href={row.path} className="font-medium hover:underline">{row.title}</Link>
              <span className="shrink-0 tabular-nums text-muted-foreground">{n(metric === 'clicks' ? row.ticketClicks : row.views)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
