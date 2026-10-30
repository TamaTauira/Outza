import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { EventImage } from '@/components/event-image'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { CITIES } from '@/lib/cities'
import { loadCommunityPage, pageKindFor, recordCommunityEntrance } from '@/lib/community'
import {
  communityCityPath, communityPageIndexable, communityPlacePath, communitySectionPath,
  isWhenKey, listingCta, redactCommunityPublic, sectionByKey,
} from '@/lib/community-shared'
import { cityFromSlug, eventPath, slugify, WHEN_KEYS } from '@/lib/seo'

const field = 'h-12 w-full rounded-lg border border-border bg-background px-3 text-base'

function dayLabel(key: string) {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export async function CommunityBoard({
  sectionKey,
  cityParam,
  place,
  whenParam,
  search,
}: {
  sectionKey: string
  cityParam?: string
  place?: string
  whenParam?: string
  search: Record<string, string | string[] | undefined>
}) {
  const section = sectionByKey(sectionKey)
  if (!section) notFound()
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const city = cityParam ? cityFromSlug(cityParam) : CITIES.find((c) => c.name === one(search.city))
  if (cityParam && !city) notFound()
  const placeIsWhen = !!place && (isWhenKey(place) || /^\d{4}-\d{2}-\d{2}$/.test(place))
  const suburbSlug = place && !placeIsWhen ? place : null
  const whenRaw = whenParam || (placeIsWhen ? place : '') || one(search.when) || ''
  const when = isWhenKey(whenRaw) ? whenRaw : null
  const dateParam = (placeIsWhen && place && /^\d{4}-\d{2}-\d{2}$/.test(place) ? place : '') || (/^\d{4}-\d{2}-\d{2}$/.test(one(search.on) || '') ? one(search.on)! : '')
  const from = dateParam || one(search.from) || ''
  const to = dateParam || one(search.to) || ''
  const free = one(search.free) === '1'
  const suburbQuery = one(search.suburb) || ''

  let data: Awaited<ReturnType<typeof loadCommunityPage>> = null
  try {
    data = await loadCommunityPage(JSON.stringify({
      section: section.key,
      city: city?.name ?? null,
      suburb: suburbQuery || suburbSlug,
      from: from || null,
      to: to || null,
      free,
      when,
    }))
  } catch (err) {
    console.error('community page failed', err instanceof Error ? err.message : err)
  }
  if (data === null && cityParam && !city) notFound()

  const rows = (data?.rows ?? []).filter((row) => !suburbSlug || slugify(row.suburb || '') === suburbSlug)
  const listingCount = new Set(rows.map((row) => row.id)).size
  const kind = pageKindFor({ city: city?.name, suburb: suburbSlug || suburbQuery, when, date: dateParam })
  const indexable = data ? communityPageIndexable(listingCount, kind) : false
  const h = await headers()
  const prefetch = /prefetch/i.test(h.get('purpose') ?? '') || /prefetch/i.test(h.get('sec-purpose') ?? '') || h.get('next-router-prefetch') === '1'
  if (!prefetch) {
    await recordCommunityEntrance(
      communitySectionPath(section.key),
      { section: section.key, city: city?.name, suburb: suburbQuery || suburbSlug },
      h.get('referer'),
      h.get('x-forwarded-host') || h.get('host'),
      h.get('user-agent'),
    ).catch(() => {})
  }

  const action = [
    communitySectionPath(section.key),
    city ? cityParam : null,
    suburbSlug,
    whenParam && isWhenKey(whenParam) ? whenParam : null,
  ].filter(Boolean).join('/')
  const suburbs = [...new Set(rows.map((row) => row.suburb).filter((s): s is string => !!s))].sort()

  return (
    <div className="min-h-screen bg-background">
      <Navbar savedCount={0} />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <p className="text-sm"><Link href="/community" className="text-muted-foreground hover:text-foreground">Community hub</Link></p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">{section.label}{city ? ` in ${city.name}` : ''}</h1>
        <p className="mt-2 text-base text-muted-foreground">{section.blurb}</p>
        {section.key === 'school-fundraisers' && (
          <p className="mt-3 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">School listings show the suburb only. Street addresses and photos of children stay off the public page.</p>
        )}
        <p className="mt-4"><Link href={`/community/submit?category=${section.key}`} className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">List one free</Link></p>

        <form method="get" action={action} className="mt-6 grid gap-3 rounded-2xl bg-card p-4 shadow-sm sm:grid-cols-2">
          <label className="text-sm font-semibold sm:col-span-2">Filter this page
            <span className="mt-1 block font-normal text-muted-foreground">Suburb, city and dates use the listing’s own details. A weekly event shows on the days it actually runs.</span>
          </label>
          {!city && (
            <label className="text-sm font-semibold">City
              <select name="city" defaultValue={one(search.city) || ''} className={`${field} mt-1 font-normal`}>
                <option value="">All cities</option>
                {CITIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </label>
          )}
          <label className="text-sm font-semibold">Suburb
            <input name="suburb" defaultValue={suburbQuery} placeholder="e.g. Newtown" className={`${field} mt-1 font-normal`} />
          </label>
          <label className="text-sm font-semibold">From
            <input type="date" name="from" defaultValue={from} className={`${field} mt-1 font-normal`} />
          </label>
          <label className="text-sm font-semibold">To
            <input type="date" name="to" defaultValue={to} className={`${field} mt-1 font-normal`} />
          </label>
          <label className="text-sm font-semibold">When
            <select name="when" defaultValue={when ?? ''} className={`${field} mt-1 font-normal`}>
              <option value="">Any day in the range</option>
              {WHEN_KEYS.map((key) => <option key={key} value={key}>{key.replace('-', ' ')}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
            <input type="checkbox" name="free" value="1" defaultChecked={free} className="h-4 w-4 accent-[#FF4E6A]" />
            Free listings only
          </label>
          <button type="submit" className="h-12 rounded-full bg-foreground px-5 text-sm font-semibold text-background sm:col-span-2">Show listings</button>
        </form>

        {!indexable && (
          <p className="mt-4 text-sm text-muted-foreground">This page stays out of search until there are enough real listings here. What’s on the page is what’s actually published.</p>
        )}

        <ul className="mt-6 space-y-4">
          {rows.map((row) => {
            const safe = redactCommunityPublic(row)
            const cta = listingCta(safe)
            const where = [safe.venueName, safe.suburb, safe.city].filter((part, i, all) => part && all.indexOf(part) === i).join(', ')
            return (
              <li key={`${row.id}-${row.occursOn}`} className="overflow-hidden rounded-2xl bg-card shadow-sm">
                <div className="relative h-36 bg-muted">
                  <EventImage src={safe.imageUrl} kind="card" alt="" sizes="100vw" category={safe.category} communityKey={safe.communityKey} crop />
                </div>
                <div className="space-y-2 p-4">
                  <p className="text-sm text-muted-foreground">{dayLabel(row.occursOn)}{row.time ? ` · ${row.time}` : ''}{row.status === 'CANCELLED' ? ' · Cancelled' : row.status === 'POSTPONED' ? ' · Postponed' : ''}</p>
                  <h2 className="font-display text-xl font-bold leading-snug"><Link href={eventPath(row)} className="hover:text-primary">{row.title}</Link></h2>
                  <p className="text-sm text-muted-foreground">{where}</p>
                  {safe.description && <p className="line-clamp-3 text-sm text-muted-foreground">{safe.description}</p>}
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="text-sm font-semibold">{row.isFree ? 'Free' : (row.price || 'See listing')}</span>
                    {cta && (
                      <a href={cta.href} className="inline-flex h-11 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground" {...(cta.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                        {cta.label}
                      </a>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
        {rows.length === 0 && (
          <p className="mt-8 rounded-2xl bg-muted px-4 py-6 text-base">Nothing in that filter yet. Be the neighbour who lists it. <Link href={`/community/submit?category=${section.key}`} className="font-semibold text-primary underline">List it free</Link>.</p>
        )}
        {city && suburbs.length > 0 && (
          <nav aria-label="Suburbs" className="mt-8 flex flex-wrap gap-2 text-sm">
            {suburbs.map((suburb) => (
              <Link key={suburb} href={`${communityPlacePath(section.key, city.name, suburb)}${free ? '?free=1' : ''}`} className="rounded-full bg-muted px-3 py-1 hover:bg-muted/70">{suburb}</Link>
            ))}
          </nav>
        )}
        {!city && (
          <nav aria-label="Cities" className="mt-8 flex flex-wrap gap-2 text-sm">
            {CITIES.map((c) => (
              <Link key={c.name} href={communityCityPath(section.key, c.name)} className="rounded-full bg-muted px-3 py-1 hover:bg-muted/70">{c.name}</Link>
            ))}
          </nav>
        )}
      </main>
      <Footer lastRefresh={null} city={city?.name} />
    </div>
  )
}

export async function communityMeta(args: Parameters<typeof CommunityBoard>[0]) {
  const section = sectionByKey(args.sectionKey)
  if (!section) return { title: 'Community | VibePeep', robots: { index: false, follow: false } }
  const city = args.cityParam ? cityFromSlug(args.cityParam) : undefined
  const suburb = args.place && !isWhenKey(args.place) && !/^\d{4}-\d{2}-\d{2}$/.test(args.place) ? args.place : null
  const when = args.whenParam && isWhenKey(args.whenParam) ? args.whenParam : args.place && isWhenKey(args.place) ? args.place : null
  let index = false
  try {
    const data = await loadCommunityPage(JSON.stringify({
      section: section.key, city: city?.name ?? null, suburb, from: null, to: null, free: false, when,
    }))
    index = !!data && communityPageIndexable(data.listingCount, pageKindFor({ city: city?.name, suburb, when }))
  } catch {
    index = false
  }
  return {
    title: `${section.label}${city ? ` in ${city.name}` : ''} | VibePeep`,
    description: section.blurb,
    robots: index ? undefined : { index: false as const, follow: true as const },
  }
}
