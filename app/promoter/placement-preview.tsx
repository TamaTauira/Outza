'use client'

import { useState } from 'react'
import { Eye, ImageOff, MapPin } from 'lucide-react'
import { ADDONS, TIERS, type Addon, type Tier } from '@/lib/tiers'

type Ev = { title: string; date: string; city?: string; venueName: string; imageUrl?: string | null }

const fmt = (d: string) => new Date(d).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

/** A mock of the sponsored card in the Featured band, using the organiser's own title and artwork. */
export function PlacementPreview({ event, tier, addons }: { event?: Ev; tier: Tier; addons: Addon[] }) {
  const t = TIERS.find((x) => x.key === tier)!
  const [imgOk, setImgOk] = useState(true)
  if (!event) return null
  const extras = ADDONS.filter((a) => addons.includes(a.key))
  return (
    <div className="rounded-xl border border-border bg-background p-5">
      <div className="flex items-center gap-2 mb-3"><Eye className="w-4 h-4 text-primary" /><h3 className="font-semibold text-sm">Placement preview</h3></div>
      <div className="grid sm:grid-cols-[220px_1fr] gap-5 items-start">
        <div className="rounded-xl overflow-hidden bg-card shadow-md border border-border">
          <div className="relative aspect-[4/3] bg-muted">
            {event.imageUrl && imgOk ? (
              <img src={event.imageUrl} alt={`Artwork for ${event.title}`} className="absolute inset-0 w-full h-full object-cover" onError={() => setImgOk(false)} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground"><ImageOff className="w-6 h-6" /></div>
            )}
            <span className="absolute z-10 top-2 left-2 rounded px-1.5 py-0.5 text-[10px] font-bold text-black" style={{ backgroundColor: t.color }}>{t.name.toUpperCase()}</span>
            <span className="absolute z-10 top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">Sponsored</span>
          </div>
          <div className="p-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-primary">{fmt(event.date)}</p>
            <p className="font-semibold text-sm leading-snug line-clamp-2 mt-0.5">{event.title}</p>
            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1 truncate"><MapPin className="w-3 h-3 shrink-0" />{event.venueName}{event.city ? `, ${event.city}` : ''}</p>
          </div>
        </div>
        <div className="text-sm">
          <p className="font-medium">Where your {t.name} campaign can appear</p>
          <ul className="mt-2 space-y-1.5">
            {t.perks.map((p) => <li key={p} className="flex gap-2 text-xs text-muted-foreground"><span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />{p}</li>)}
            {extras.map((a) => <li key={a.key} className="flex gap-2 text-xs text-muted-foreground"><span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 bg-primary" /><span><strong className="text-foreground">{a.name}:</strong> {a.desc}</span></li>)}
          </ul>
          <p className="mt-3 text-[11px] text-muted-foreground">Illustrative preview. Placements are labelled sponsored, and their position depends on available inventory. We don&apos;t guarantee a number of impressions or clicks.</p>
        </div>
      </div>
    </div>
  )
}
