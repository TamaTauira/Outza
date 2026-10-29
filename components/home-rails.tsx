'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { eventPath } from '@/lib/seo'
import { CATEGORIES } from '@/lib/categories'
import { addDays, formatPrice, formatTime } from '@/lib/board'
import { EventImage } from '@/components/event-image'
import type { ClientImage } from '@/lib/images/spec'

type RailEvent = {
  id: string
  title: string
  date: string
  time: string | null
  venueName: string
  city?: string | null
  category: string
  isFree: boolean
  price: string | null
  priceMin?: number | null
  priceMax?: number | null
  imageUrl?: string | null
  imageAsset?: ClientImage | null
}

const toMin = (t: string | null) => {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h)) return null
  return h * 60 + (m || 0)
}

function weekendFrom(today: string) {
  const day = new Date(`${today}T00:00:00Z`).getUTCDay()
  const satOffset = day === 6 ? 0 : day === 0 ? -1 : 6 - day
  return { from: addDays(today, satOffset), to: addDays(today, satOffset + 1) }
}

export function HomeRails({
  city,
  today,
  onSeeAll,
}: {
  city: string
  today: string | null
  onSeeAll: (kind: 'tonight' | 'weekend' | 'free') => void
}) {
  const [rows, setRows] = useState<RailEvent[]>([])

  useEffect(() => {
    if (!today) return
    const weekend = weekendFrom(today)
    const params = new URLSearchParams({ limit: '80', dateFrom: today, dateTo: weekend.to })
    if (city) params.set('city', city)
    let live = true
    fetch(`/api/events?${params}`)
      .then((r) => r.json())
      .then((d) => { if (live) setRows(d?.events ?? []) })
      .catch(() => { if (live) setRows([]) })
    return () => { live = false }
  }, [city, today])

  if (!today) return null
  const weekend = weekendFrom(today)
  const tonight = rows.filter((e) => e.date.slice(0, 10) === today && (toMin(e.time) === null || (toMin(e.time) ?? 0) >= 17 * 60)).slice(0, 8)
  const weekendRows = rows.filter((e) => {
    const day = e.date.slice(0, 10)
    return day >= weekend.from && day <= weekend.to
  }).slice(0, 8)
  const free = rows.filter((e) => e.isFree).slice(0, 8)
  const rails = [
    { key: 'tonight' as const, label: 'Tonight', items: tonight },
    { key: 'weekend' as const, label: 'This weekend', items: weekendRows },
    { key: 'free' as const, label: 'Free', items: free },
  ].filter((r) => r.items.length > 0)

  if (!rails.length) return null

  return (
    <div className="mb-6 space-y-5">
      {rails.map((rail) => (
        <section key={rail.key} aria-label={rail.label}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{rail.label}</h2>
            <button type="button" onClick={() => onSeeAll(rail.key)} className="text-xs font-semibold text-primary hover:underline">See all</button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
            {rail.items.map((ev) => <RailCard key={`${rail.key}-${ev.id}`} ev={ev} />)}
          </div>
        </section>
      ))}
    </div>
  )
}

function RailCard({ ev }: { ev: RailEvent }) {
  const color = CATEGORIES.find((c) => c.name === ev.category)?.color ?? '#FF7A1A'
  const price = formatPrice(ev.isFree, ev.price, ev.priceMin, ev.priceMax)
  const time = formatTime(ev.time)
  return (
    <Link href={eventPath(ev)} className="w-[200px] shrink-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm hover:-translate-y-0.5 hover:shadow-md transition">
      <div className="relative aspect-[4/3]" style={{ background: `linear-gradient(145deg, ${color}, #1a120c)` }}>
        <EventImage image={ev.imageAsset} src={ev.imageUrl} kind="card" alt="" sizes="200px" compact crop accent={color} />
        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">{price.value}</span>
      </div>
      <div className="p-2.5">
        <p className="truncate text-sm font-semibold">{ev.title}</p>
        <p className="truncate text-xs text-muted-foreground">{time.hm}{time.ampm ? ` ${time.ampm}` : ''} · {ev.venueName}</p>
      </div>
    </Link>
  )
}
