'use client'

import { useEffect, useState } from 'react'
import { holdScrollRestore } from '@/lib/scroll-memory'
import Link from 'next/link'
import { Flame, Heart, Megaphone, Star } from 'lucide-react'
import { useSaved, type SavedEvent } from '@/lib/saved'
import { eventPath } from '@/lib/seo'
import { CATEGORIES } from '@/lib/categories'
import { formatPrice, formatTime } from '@/lib/board'
import { tierDef } from '@/lib/tiers'
import { EventImage } from '@/components/event-image'
import { ReachBeacon } from '@/components/reach-beacon'
import type { ClientImage } from '@/lib/images/spec'

interface FeaturedItem {
  id: string; title: string; date: string; time: string | null; venueName: string; city?: string
  category: string; isFree: boolean; price: string | null; priceMin?: number | null; priceMax?: number | null; imageUrl?: string | null; imageAsset?: ClientImage | null; tier: string
  creative?: string | null
  sponsored?: boolean
}

export function FeaturedTurnstile({ city }: { city: string }) {
  const [items, setItems] = useState<FeaturedItem[]>([])

  useEffect(() => {
    let live = true
    const release = holdScrollRestore('featured')
    fetch(`/api/featured${city ? `?city=${encodeURIComponent(city)}` : ''}`)
      .then((r) => r.json())
      .then((d) => {
        if (!live) return
        const rows: FeaturedItem[] = d?.items ?? []
        setItems(city ? rows.filter((it) => !it.city || it.city === city) : rows)
      })
      .catch((err) => console.error('Failed to load featured events:', err))
      .finally(release)
    return () => { live = false; release() }
  }, [city])

  const cards = [...items.map((it) => <FeaturedCard key={it.id} it={it} />), <PromoteCard key="cta" />]

  const spotlightIds = items.filter((item) => item.sponsored || (item.tier && item.tier !== 'HOT')).map((item) => item.id)
  return (
    // Full-bleed band: breaks out of the 1280px page container to span the whole viewport
    <section className="relative mb-8" aria-label="Hot right now">
      <ReachBeacon surface="hot" ids={items.map((item) => item.id)} spotlightIds={spotlightIds} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 fill-current text-[#F5B700]" />
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Hot right now.</h2>
          </div>
          <p className="mt-1 text-muted-foreground">Everyone’s talking about it. Sponsored placements stay labelled.</p>
        </div>
        <Link href="/promoters" className="text-sm font-semibold text-primary hover:underline">Feature your event</Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 snap-x [scrollbar-width:thin] lg:grid lg:grid-cols-3 lg:overflow-visible xl:grid-cols-4">
        {cards}
      </div>
    </section>
  )
}

function FeaturedCard({ it, hidden }: { it: FeaturedItem; hidden?: boolean }) {
  const { isSaved, toggle } = useSaved()
  const color = CATEGORIES.find((c) => c.name === it.category)?.color ?? '#FF7A1A'
  const t = tierDef(it.tier)
  const badge = it.tier === 'HOT' ? { label: 'HOT', bg: '#c2410c', fg: '#ffffff' } : { label: 'SPONSORED', bg: t?.color ?? '#C0C7D1', fg: '#000000' }
  const price = formatPrice(it.isFree, it.price, it.priceMin, it.priceMax)
  const time = formatTime(it.time)
  const date = new Date(it.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const saved = isSaved(it.id)
  const save = () => toggle({
    id: it.id, title: it.title, description: null, date: it.date, endDate: null, time: it.time, endTime: null,
    venueName: it.venueName, suburb: null, category: it.category, subTags: [], isLGBTI: false, isFree: it.isFree,
    price: it.price, priceMin: it.priceMin, priceMax: it.priceMax, ticketUrl: null, city: it.city, imageUrl: it.imageUrl,
  } as SavedEvent)
  return (
    <article aria-hidden={hidden} className="relative w-[78vw] max-w-[320px] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card shadow-md lg:w-auto lg:max-w-none">
      <Link href={eventPath(it)} tabIndex={hidden ? -1 : undefined} className="block">
        <div className="relative aspect-[4/5] overflow-hidden sm:aspect-[4/3]" style={{ background: `linear-gradient(135deg, ${color}, ${color}55)` }}>
          <EventImage image={it.imageAsset} src={it.imageUrl} kind="featured" alt={it.title} sizes="(min-width: 1024px) 25vw, 80vw" crop accent={color} category={it.category} slot="featured" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
          <span title={it.tier === 'HOT' ? 'Popular on VibePeep' : `${t?.name ?? 'Sponsored'} placement`} className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold shadow-md" style={{ backgroundColor: badge.bg, color: badge.fg }}>
            {it.tier === 'HOT' && <Flame className="h-2.5 w-2.5" />}{badge.label}
          </span>
          <span className="absolute bottom-3 left-3 z-10 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">{it.category}</span>
          <span className="absolute bottom-3 right-3 z-10 rounded bg-black/70 px-2 py-0.5 font-mono text-xs text-white">{[price.prefix, price.value].filter(Boolean).join(' ')}</span>
        </div>
        <div className="p-3">
          <p className="truncate font-semibold" title={it.title}>{it.title}</p>
          {it.tier !== 'HOT' && it.creative && <p className="truncate text-[11px] text-primary">{it.creative}</p>}
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{date} · {time.hm}{time.ampm ? ` ${time.ampm}` : ''}</p>
          <p className="truncate text-xs text-muted-foreground">{it.venueName}{it.city ? ` · ${it.city}` : ''}</p>
        </div>
      </Link>
      <button type="button" onClick={save} aria-pressed={saved} aria-label={saved ? `Remove ${it.title} from saved` : `Save ${it.title}`} className="absolute right-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white">
        <Heart className={saved ? 'h-4 w-4 fill-current text-[#FF4E6A]' : 'h-4 w-4'} />
      </button>
    </article>
  )
}

function PromoteCard() {
  return (
    <Link href="/promoters" className="flex w-[78vw] max-w-[320px] shrink-0 flex-col justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/60 p-4 transition hover:bg-primary/5 lg:w-auto lg:max-w-none">
      <Megaphone className="w-6 h-6 text-primary" />
      <p className="font-semibold text-sm">Your event could be here</p>
      <p className="text-xs text-muted-foreground">Get it seen from $19.</p>
    </Link>
  )
}
