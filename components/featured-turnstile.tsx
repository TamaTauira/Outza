'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Flame, Megaphone, Pause, Play, Star } from 'lucide-react'
import { eventPath } from '@/lib/seo'
import { CATEGORIES } from '@/lib/categories'
import { formatPrice, formatTime } from '@/lib/board'
import { tierDef } from '@/lib/tiers'
import { EventImage } from '@/components/event-image'
import { cn } from '@/lib/utils'
import type { ClientImage } from '@/lib/images/spec'

interface FeaturedItem {
  id: string; title: string; date: string; time: string | null; venueName: string; city?: string
  category: string; isFree: boolean; price: string | null; imageUrl?: string | null; imageAsset?: ClientImage | null; tier: string
}

export function FeaturedTurnstile({ city }: { city: string }) {
  const [items, setItems] = useState<FeaturedItem[]>([])
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    fetch(`/api/featured${city ? `?city=${encodeURIComponent(city)}` : ''}`)
      .then((r) => r.json())
      .then((d) => setItems(d?.items ?? []))
      .catch((err) => console.error('Failed to load featured events:', err))
  }, [city])

  const cards = [...items.map((it) => <FeaturedCard key={it.id} it={it} />), <PromoteCard key="cta" />]
  const loop = items.length >= 2

  return (
    // Full-bleed band: breaks out of the 1280px page container to span the whole viewport
    <section className="relative w-screen ml-[calc(50%-50vw)] mb-6 py-5 border-y border-border bg-card/40" aria-label="Hot right now">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 flex flex-wrap items-end justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-[#F5B700] fill-current" />
            <h2 className="font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground">Hot right now</h2>
          </div>
          <p className="mt-1 text-base sm:text-sm text-muted-foreground">Promoted picks and crowd favourites, front and centre.</p>
        </div>
        <div className="flex items-center gap-3">
          {loop && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-pressed={paused}
              className="motion-reduce:hidden inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-border text-sm font-semibold hover:bg-muted"
            >
              {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              {paused ? 'Play' : 'Pause'}
            </button>
          )}
          <Link href="/promoters" className="text-sm font-semibold text-primary hover:underline">Feature Your Event →</Link>
        </div>
      </div>
      <div className="turnstile-viewport relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_3%,black_97%,transparent)]">
        <div className={cn(loop ? 'flex w-max gap-3 px-3 animate-turnstile hover:[animation-play-state:paused]' : 'flex gap-3 px-4 sm:px-6 overflow-x-auto [scrollbar-width:none]', paused && 'turnstile-paused')}>
          {cards}
          {loop && items.map((it) => <FeaturedCard key={`dup-${it.id}`} it={it} hidden duplicate />)}
        </div>
      </div>
    </section>
  )
}

function FeaturedCard({ it, hidden, duplicate }: { it: FeaturedItem; hidden?: boolean; duplicate?: boolean }) {
  const color = CATEGORIES.find((c) => c.name === it.category)?.color ?? '#f9652a'
  const t = tierDef(it.tier)
  const badge = it.tier === 'HOT' ? { label: 'HOT', bg: '#c2410c', fg: '#ffffff' } : { label: (t?.name ?? it.tier).toUpperCase(), bg: t?.color ?? '#C0C7D1', fg: '#000000' }
  const price = formatPrice(it.isFree, it.price)
  const time = formatTime(it.time)
  const date = new Date(it.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  return (
    <Link href={eventPath(it)} aria-hidden={hidden} tabIndex={hidden ? -1 : undefined} className={cn('shrink-0 w-[260px] rounded-xl bg-card border border-border overflow-hidden shadow-md hover:-translate-y-0.5 hover:shadow-lg transition', duplicate && 'turnstile-dup')}>
      <div className="relative aspect-[16/9] overflow-hidden" style={{ background: `linear-gradient(135deg, ${color}, ${color}55)` }}>
        <EventImage image={it.imageAsset} src={it.imageUrl} kind="featured" alt={it.title} sizes="260px" compact />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />
        <span className="absolute z-10 top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold shadow-md" style={{ backgroundColor: badge.bg, color: badge.fg }}>
          {it.tier === 'HOT' && <Flame className="w-2.5 h-2.5" />}{badge.label}
        </span>
        <span className="absolute z-10 bottom-2 right-2 px-2 py-0.5 rounded bg-black/75 text-white font-mono text-sm">{price.value}</span>
      </div>
      <div className="p-3 min-h-[6.25rem]">
        <p className="font-semibold text-sm leading-snug line-clamp-2 break-words" title={it.title}>{it.title}</p>
        <p className="text-sm text-muted-foreground truncate mt-0.5">{date} · {time.hm}{time.ampm ? ` ${time.ampm}` : ''}</p>
        <p className="text-sm text-muted-foreground truncate">{it.venueName}{it.city ? ` · ${it.city}` : ''}</p>
      </div>
    </Link>
  )
}

function PromoteCard() {
  return (
    <Link href="/promoters" className="shrink-0 w-[260px] rounded-xl border-2 border-dashed border-primary/60 overflow-hidden flex flex-col hover:bg-primary/5 transition">
      <div className="relative aspect-[16/9] flex items-center justify-center bg-primary/5">
        <Megaphone className="w-8 h-8 text-primary" />
      </div>
      <div className="p-3 min-h-[6.25rem]">
        <p className="font-semibold text-sm leading-snug">Your event could be here</p>
        <p className="text-sm text-muted-foreground mt-0.5">Get it seen from $19.</p>
      </div>
    </Link>
  )
}
