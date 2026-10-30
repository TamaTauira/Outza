'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Accessibility, Baby, Bus, Building2, ExternalLink, Map as MapIcon } from 'lucide-react'
import { toast } from 'sonner'
import { sourceLabel } from '@/lib/quality'
import { formatUpdated } from '@/lib/listing-window'
import { placeLine } from '@/lib/place'
import { cn } from '@/lib/utils'
import { CATEGORIES } from '@/lib/categories'
import { VenueMap } from '@/components/venue-map'

export const TRANSIT: Record<string, { name: string; url: string }> = {
  Sydney: { name: 'Transport NSW', url: 'https://transportnsw.info/trip' },
  Newcastle: { name: 'Transport NSW', url: 'https://transportnsw.info/trip' },
  Melbourne: { name: 'PTV', url: 'https://www.ptv.vic.gov.au/journey' },
  Brisbane: { name: 'Translink', url: 'https://jp.translink.com.au/plan-your-journey/journey-planner' },
  'Gold Coast': { name: 'Translink', url: 'https://jp.translink.com.au/plan-your-journey/journey-planner' },
  Perth: { name: 'Transperth', url: 'https://www.transperth.wa.gov.au/Journey-Planner' },
  Adelaide: { name: 'Adelaide Metro', url: 'https://www.adelaidemetro.com.au/planner' },
  Canberra: { name: 'Transport Canberra', url: 'https://www.transport.act.gov.au/' },
  Hobart: { name: 'Metro Tasmania', url: 'https://www.metrotas.com.au/' },
  Darwin: { name: 'Darwinbus', url: 'https://nt.gov.au/driving/public-transport-cycling/public-buses' },
}

/** Finds a sentence in the listing's own description that mentions the topic. Quoted verbatim, never inferred. */
function quote(desc: string | null | undefined, re: RegExp): string | null {
  if (!desc) return null
  const s = desc.split(/(?<=[.!?])\s+/).find((x) => re.test(x))
  return s ? s.trim().slice(0, 300) : null
}
const AGE_RE = /\b(18\+|R18|all ages|under 1[68]s?|minors?|age restrict|family[- ]friendly|kids? (are )?welcome|licensed venue)\b/i
const ACC_RE = /\b(wheelchair|accessib|step[- ]free|auslan|hearing loop|companion card|mobility)\w*/i
const TRANSPORT_RE = /\b(train|station|bus|ferry|light rail|tram|parking|car park|public transport)\b/i

/** Shared hero frame: short enough to avoid a giant letterboxed banner. */
export const HERO_FRAME = 'relative h-52 sm:h-60 overflow-hidden bg-muted'

/** Hero image plus thumbnails for any extra artwork the source supplied. */
export function EventGallery({ event, children }: { event: any; children: React.ReactNode }) {
  const extras: string[] = event?.galleryUrls ?? []
  const [sel, setSel] = useState(-1)
  if (!extras.length) return <>{children}</>
  return (
    <div>
      {sel < 0 ? children : (
        <div className={cn(HERO_FRAME, 'rounded-xl border border-border')}>
          <Image src={extras[sel]} alt={`${event.title} — image ${sel + 2}`} fill unoptimized className="object-contain" onError={() => setSel(-1)} />
        </div>
      )}
      <div className="flex gap-2 pt-2 overflow-x-auto" aria-label="Image gallery">
        <button onClick={() => setSel(-1)} className={cn('shrink-0 h-12 px-3 rounded-md text-xs font-semibold border', sel < 0 ? 'border-primary text-primary' : 'border-border')}>Main</button>
        {extras.map((u, i) => (
          <button key={u} onClick={() => setSel(i)} aria-label={`Show image ${i + 2}`} className={cn('relative shrink-0 w-20 h-12 rounded-md overflow-hidden border-2 bg-muted', sel === i ? 'border-primary' : 'border-transparent')}>
            <Image src={u} alt="" fill unoptimized className="object-cover" />
          </button>
        ))}
      </div>
    </div>
  )
}

/** Copies or shares the listing, and counts the share. Click handler only — never during render. */
export async function shareEvent(event: { id: string; title: string }) {
  const url = window.location.href
  fetch(`/api/events/${event.id}/signal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'SHARE' }), keepalive: true }).catch((err) => console.error('Share count failed:', err))
  try {
    if (navigator.share) await navigator.share({ title: event.title, url })
    else { await navigator.clipboard.writeText(url); toast.success('Link copied. Go on, send it.') }
  } catch (err: any) { if (err?.name !== 'AbortError') console.error('Share failed:', err) }
}

/** One short line: where the listing came from, and when it was updated. */
export function SourceLine({ event }: { event: any }) {
  const label = sourceLabel(event?.source).replace(/\bverified\b/ig, '').replace(/\s{2,}/g, ' ').trim() || 'a listing site'
  const href = event?.sourceUrl || event?.organiserUrl || event?.ticketUrl
  const linked = typeof href === 'string' && /^https?:\/\//i.test(href) ? href : null
  const updated = formatUpdated(event?.quality?.checkedAt)
  return (
    <p className="text-xs text-muted-foreground">
      Source: {linked
        ? <a href={linked} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">{label}</a>
        : label}
      {updated ? ` · Updated ${updated}` : ''}
    </p>
  )
}

function Info({ icon: Icon, title, children }: { icon: typeof Bus; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2.5">
      <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5"><Icon className="w-3.5 h-3.5 text-primary" />{title}</h3>
      <div className="text-sm text-muted-foreground space-y-1">{children}</div>
    </div>
  )
}

/** Map, getting there, organiser, accessibility and age. Sections with nothing to say render nothing. */
export function EventExtras({ event }: { event: any }) {
  const place = placeLine(event)
  const precise = event.latitude != null && event.longitude != null && event.source !== 'promoter'
  const dest = precise ? `${event.latitude},${event.longitude}` : place
  const cat = CATEGORIES.find((c) => c.name === event.category)
  const dir = (mode: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=${mode}`
  const transit = TRANSIT[event.city]
  const age = event.ageRestriction || quote(event.description, AGE_RE)
  const acc = event.accessibilityInfo || quote(event.description, ACC_RE)
  const travel = event.transportInfo || quote(event.description, TRANSPORT_RE)
  const organiserName = event.organiserName || null
  const organiserUrl = event.organiserUrl && event.organiserUrl !== event.ticketUrl ? event.organiserUrl : null
  const showMap = !!(place || precise)
  const showTravel = !!dest
  const showOrganiser = !!(organiserName || organiserUrl)
  const notes = [acc, age].filter(Boolean).length
  if (!showMap && !showTravel && !showOrganiser && !acc && !age) return null

  return (
    <div className="space-y-4">
      {showMap && (
        <section>
          <h2 className="font-display font-semibold text-base mb-2 flex items-center gap-1.5"><MapIcon className="w-4 h-4 text-primary" />Where to rock up</h2>
          <div className="relative h-40 sm:h-48 rounded-lg overflow-hidden bg-muted border border-border">
            <VenueMap lat={precise ? event.latitude : null} lng={precise ? event.longitude : null} query={place} city={event.city} color={cat?.color ?? '#FF7A1A'} letter={event.category?.[0] ?? 'E'} label={event.venueName || event.title} />
          </div>
          {place && <p className="text-sm text-muted-foreground mt-1.5">{place}</p>}
        </section>
      )}

      {showTravel && (
        <section>
          <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5"><Bus className="w-3.5 h-3.5 text-primary" />Getting there</h3>
          {travel && <p className="text-sm text-foreground mb-1.5">{travel}</p>}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <a href={dir('transit')} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Public transport</a>
            <a href={dir('walking')} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Walking</a>
            <a href={dir('driving')} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Driving</a>
            {transit && <a href={transit.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">{transit.name} trip planner</a>}
          </div>
        </section>
      )}

      {showOrganiser && (
        <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
          <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
          {organiserName && <span className="text-foreground">Organised by {organiserName}</span>}
          {organiserUrl && (
            <a href={organiserUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              Original organiser listing <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </p>
      )}

      {(acc || age) && (
        <div className={cn('grid gap-3', notes > 1 && 'sm:grid-cols-2')}>
          {acc && (
            <Info icon={Accessibility} title="Accessibility">
              <p className="text-foreground">{acc}</p>
            </Info>
          )}
          {age && (
            <Info icon={Baby} title="Age">
              <p className="text-foreground">{age}</p>
            </Info>
          )}
        </div>
      )}
    </div>
  )
}
