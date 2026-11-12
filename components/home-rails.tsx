'use client'

import { useEffect, useState } from 'react'
import { holdScrollRestore } from '@/lib/scroll-memory'
import Link from 'next/link'
import { eventPath } from '@/lib/seo'
import { areasForCity, CATEGORIES } from '@/lib/categories'
import { addDays, formatPrice, formatTime } from '@/lib/board'
import { minutesNow, orderedWindow } from '@/lib/listing-window'
import { EventImage } from '@/components/event-image'
import type { ClientImage } from '@/lib/images/spec'

type RailEvent = {
  id: string
  title: string
  date: string
  time: string | null
  endTime?: string | null
  endDate?: string | null
  status?: string | null
  duplicateOfId?: string | null
  venueName: string
  venueAddress?: string | null
  suburb?: string | null
  city?: string | null
  category: string
  isFree: boolean
  price: string | null
  priceMin?: number | null
  priceMax?: number | null
  imageUrl?: string | null
  imageAsset?: ClientImage | null
  sponsored?: boolean
}

const RAIL_SIZE = 5

function weekendFrom(today: string) {
  const day = new Date(`${today}T00:00:00Z`).getUTCDay()
  const satOffset = day === 6 ? 0 : day === 0 ? -1 : 6 - day
  return { from: addDays(today, satOffset), to: addDays(today, satOffset + 1) }
}

function inWeekend(ev: RailEvent, from: string, to: string) {
  const day = ev.date.slice(0, 10)
  return day >= from && day <= to
}

/** Sponsored cards lead the rail. Organic cards fill the rest, without repeating an id. */
export function mixRail(sponsored: RailEvent[], organic: RailEvent[], limit = RAIL_SIZE): RailEvent[] {
  const seen = new Set<string>()
  const out: RailEvent[] = []
  for (const ev of [...sponsored, ...organic]) {
    if (seen.has(ev.id)) continue
    seen.add(ev.id)
    out.push(ev)
    if (out.length >= limit) break
  }
  return out
}

export function HomeRails({
  city,
  today,
  onSeeAll,
  onShown,
  onSuburb,
}: {
  city: string
  today: string | null
  onSeeAll: (kind: 'tonight' | 'weekend') => void
  onShown?: (ids: string[]) => void
  onSuburb?: (suburb: string) => void
}) {
  const [rows, setRows] = useState<RailEvent[]>([])
  const [featured, setFeatured] = useState<RailEvent[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!today) return
    const weekend = weekendFrom(today)
    const tonightParams = new URLSearchParams({ limit: '24', dateFrom: today, dateTo: today, timeFrom: '17:00' })
    const weekendParams = new URLSearchParams({ limit: '24', dateFrom: weekend.from, dateTo: weekend.to })
    if (city) {
      tonightParams.set('city', city)
      weekendParams.set('city', city)
    }
    let live = true
    const release = holdScrollRestore('home-rails')
    Promise.all([
      fetch(`/api/events?${tonightParams}`).then((r) => r.json()).catch(() => ({})),
      fetch(`/api/events?${weekendParams}`).then((r) => r.json()).catch(() => ({})),
      fetch(`/api/featured${city ? `?city=${encodeURIComponent(city)}` : ''}`).then((r) => r.json()).catch(() => ({})),
    ]).then(([tonight, weekendEvents, hot]) => {
      if (!live) return
      const seen = new Set<string>()
      const merged: RailEvent[] = []
      for (const ev of [...(tonight?.events ?? []), ...(weekendEvents?.events ?? [])]) {
        if (seen.has(ev.id)) continue
        seen.add(ev.id)
        merged.push(ev)
      }
      setRows(merged)
      const items: RailEvent[] = (hot?.items ?? []).map((it: RailEvent & { tier?: string; sponsored?: boolean }) => ({
        ...it,
        sponsored: it.sponsored === true || (!!it.tier && it.tier !== 'HOT'),
      }))
      setFeatured(city ? items.filter((it) => !it.city || it.city === city) : items)
      setReady(true)
    }).finally(release)
    return () => { live = false; release() }
  }, [city, today])

  useEffect(() => { setReady(false) }, [city, today])

  if (!today) return null
  const weekend = weekendFrom(today)
  const tonightOrganic = orderedWindow(
    rows.filter((e) => e.date.slice(0, 10) === today || (e.endDate ? e.endDate.slice(0, 10) >= today && e.date.slice(0, 10) <= today : false)),
    { window: 'tonight', day: today, nowMinutes: minutesNow(city), dropEnded: true },
  )
  const tonightSponsored = featured.filter((e) => e.sponsored && e.date.slice(0, 10) === today)
  const weekendOrganic = rows.filter((e) => inWeekend(e, weekend.from, weekend.to))
  const weekendSponsored = featured.filter((e) => e.sponsored && inWeekend(e, weekend.from, weekend.to))
  const tonight = mixRail(tonightSponsored, tonightOrganic)
  const weekendRows = mixRail(weekendSponsored, weekendOrganic)
  const place = city || 'Australia'
  const rails = [
    { key: 'tonight' as const, label: `Tonight in ${place}`, items: tonight, empty: 'Nothing still on from 5pm.' },
    { key: 'weekend' as const, label: 'This weekend', items: weekendRows, empty: 'Nothing on the books for Saturday and Sunday yet.' },
  ]
  const shown = rails.flatMap((r) => r.items.map((ev) => ev.id))

  const areas = areasForCity(city)
  const counts = new Map<string, number>()
  for (const ev of rows) {
    const blob = `${ev.suburb ?? ''} ${ev.venueAddress ?? ''} ${ev.venueName ?? ''}`.toLowerCase()
    for (const area of areas) {
      if (blob.includes(area.toLowerCase())) counts.set(area, (counts.get(area) ?? 0) + 1)
    }
  }
  const neighbourhoods = [...counts.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 14)

  return (
    <div className="mb-8 space-y-6">
      {rails.map((rail, index) => (
        <section key={rail.key} aria-label={rail.label} data-peep-rail={index === 0 ? '1' : undefined}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">{rail.label}</h2>
            <button type="button" onClick={() => onSeeAll(rail.key)} className="text-sm font-semibold text-primary hover:underline">See all</button>
          </div>
          {rail.items.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin] lg:grid lg:grid-cols-5 lg:overflow-visible">
              {rail.items.map((ev) => <RailCard key={`${rail.key}-${ev.id}`} ev={ev} />)}
            </div>
          ) : ready ? (
            <p className="text-sm text-muted-foreground">{rail.empty}</p>
          ) : null}
        </section>
      ))}
      {neighbourhoods.length > 0 && (
        <section id="neighbourhoods" aria-label="A peep around the neighbourhoods">
          <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">A peep around the neighbourhoods</h2>
          <p className="mt-1 text-sm text-muted-foreground">Tap a suburb to filter the list. No extra posters.</p>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {neighbourhoods.map(([name, count]) => (
              <button key={name} type="button" onClick={() => onSuburb?.(name)} className="h-10 shrink-0 rounded-full border border-border bg-card px-3 text-sm font-medium hover:border-primary">
                {name} <span className="text-muted-foreground">{count}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <Shown ids={shown} onShown={onShown} />
    </div>
  )
}

function Shown({ ids, onShown }: { ids: string[]; onShown?: (ids: string[]) => void }) {
  const key = ids.join('|')
  useEffect(() => { onShown?.(ids) }, [key])
  return null
}

function RailCard({ ev }: { ev: RailEvent }) {
  const color = CATEGORIES.find((c) => c.name === ev.category)?.color ?? '#FF7A1A'
  const price = formatPrice(ev.isFree, ev.price, ev.priceMin, ev.priceMax)
  const time = formatTime(ev.time)
  return (
    <Link href={eventPath(ev)} className="w-[200px] shrink-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md lg:w-auto">
      <div className="relative aspect-[4/3]" style={{ background: `linear-gradient(145deg, ${color}, #1a120c)` }}>
        <EventImage image={ev.imageAsset} src={ev.imageUrl} kind="card" alt="" sizes="200px" compact crop accent={color} category={ev.category} slot="card" />
        {ev.sponsored && <span className="absolute left-2 top-2 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Sponsored</span>}
        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">{price.value}</span>
      </div>
      <div className="p-2.5">
        <p className="truncate text-sm font-semibold">{ev.title}</p>
        <p className="truncate text-xs text-muted-foreground">{ev.time ? `${time.hm}${time.ampm ? ` ${time.ampm}` : ''}` : 'Time not listed'} · {ev.venueName}</p>
      </div>
    </Link>
  )
}
