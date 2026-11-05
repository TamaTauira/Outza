'use client'

import { useState } from 'react'
import { Car, Check, ChevronDown, Compass, ExternalLink, MapPin, Plus, Store, Utensils, Wine } from 'lucide-react'
import { kindLabel } from '@/lib/local-ads-shared'
import type { ItineraryItem } from '@/lib/itinerary'

export type RoutePick = { id: string; eventId: string; kind: string; businessName: string; blurb: string; address: string | null; host: string; venue: string | null }
const ICONS: Record<string, typeof Store> = { DINING: Utensils, BAR: Wine, PARKING: Car, EXPERIENCE: Compass, SERVICE: Store }

export const pickStopId = (p: RoutePick) => `ad-${p.id}`

const toMin = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null)
const toTime = (m: number) => { const x = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}` }

/** A sensible slot between two stops: from when the first wraps up until the next begins (an hour if there's no gap). */
export function slotBetween(from: ItineraryItem, to: ItineraryItem) {
  const fs = toMin(from.time), fe = toMin(from.endTime), ts = toMin(to.time)
  const start = fe ?? (fs !== null ? fs + 120 : ts !== null ? ts - 60 : 18 * 60)
  const end = ts !== null && ts > start ? ts : start + 60
  return { time: toTime(start), endTime: toTime(end) }
}

/** Collapsed dropdown of paid local recommendations near the stops either side of a leg. Opt-in: nothing shows until tapped. */
export function RoutePicks({ picks, isAdded, onAdd, onOpen }: { picks: RoutePick[]; isAdded: (p: RoutePick) => boolean; onAdd: (p: RoutePick) => void; onOpen: (p: RoutePick[]) => void }) {
  const [open, setOpen] = useState(false)
  if (!picks.length) return null
  const toggle = () => { if (!open) onOpen(picks); setOpen(!open) }
  return (
    <div className="ml-5 py-1">
      <button type="button" onClick={toggle} aria-expanded={open} className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold hover:bg-primary/20 transition-colors">
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        {open ? 'Hide sponsored stops' : `Fancy a pit stop? ${picks.length} sponsored ${picks.length === 1 ? 'pick' : 'picks'} on the way`}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {picks.map((p) => {
            const Icon = ICONS[p.kind] ?? Store
            const added = isAdded(p)
            return (
              <div key={p.id} className="rounded-lg bg-card border border-border p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[11px] font-semibold"><Icon className="w-3 h-3" />Recommended · {kindLabel(p.kind)}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Sponsored</span>
                </div>
                <p className="mt-2 text-sm font-semibold">{p.businessName}</p>
                <p className="text-xs text-muted-foreground">{p.blurb}</p>
                {(p.address || p.venue) && <p className="mt-1 text-xs text-muted-foreground flex items-start gap-1"><MapPin className="w-3 h-3 shrink-0 mt-px" />{p.address ?? `Near ${p.venue}`}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  {added ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground"><Check className="w-3.5 h-3.5 text-primary" />In your itinerary</span>
                  ) : (
                    <button type="button" onClick={() => onAdd(p)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Plus className="w-3.5 h-3.5" />Add to My Itinerary</button>
                  )}
                  <a href={`/api/local-ads/${p.id}/go`} target="_blank" rel="sponsored noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Visit {p.host || 'website'}<ExternalLink className="w-3 h-3" /></a>
                </div>
              </div>
            )
          })}
          <p className="text-[11px] text-muted-foreground">Paid placements from local businesses near your stops. Check opening hours with the business before you go.</p>
        </div>
      )}
    </div>
  )
}
