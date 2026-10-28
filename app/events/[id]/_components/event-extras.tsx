'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Accessibility, Baby, Bus, Building2, ExternalLink, RefreshCw, Share2, Map as MapIcon } from 'lucide-react'
import { toast } from 'sonner'
import { checkedAgo } from '@/lib/board'
import { sourceLabel } from '@/lib/quality'
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

/** Hero image plus thumbnails for any extra artwork the source supplied. */
export function EventGallery({ event, children }: { event: any; children: React.ReactNode }) {
  const extras: string[] = event?.galleryUrls ?? []
  const [sel, setSel] = useState(-1)
  if (!extras.length) return <>{children}</>
  return (
    <div>
      {sel < 0 ? children : (
        <div className="relative aspect-video overflow-hidden bg-muted">
          <Image src={extras[sel]} alt={`${event.title} — image ${sel + 2}`} fill unoptimized className="object-contain" onError={() => setSel(-1)} />
        </div>
      )}
      <div className="flex gap-2 p-3 overflow-x-auto bg-muted/40" aria-label="Image gallery">
        <button onClick={() => setSel(-1)} className={cn('shrink-0 h-14 px-3 rounded-md text-xs font-semibold border', sel < 0 ? 'border-primary text-primary' : 'border-border')}>Main</button>
        {extras.map((u, i) => (
          <button key={u} onClick={() => setSel(i)} aria-label={`Show image ${i + 2}`} className={cn('relative shrink-0 w-24 h-14 rounded-md overflow-hidden border-2 bg-muted', sel === i ? 'border-primary' : 'border-transparent')}>
            <Image src={u} alt="" fill unoptimized className="object-cover" />
          </button>
        ))}
      </div>
    </div>
  )
}

/** "Last verified … from X · View original listing" + share. */
export function VerifiedLine({ event }: { event: any }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => { setNow(Date.now()) }, [])
  const checked = event?.quality?.checkedAt
  const original = event?.organiserUrl || event?.ticketUrl
  const share = async () => {
    const url = window.location.href
    fetch(`/api/events/${event.id}/signal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'SHARE' }), keepalive: true }).catch((err) => console.error('Share count failed:', err))
    try {
      if (navigator.share) await navigator.share({ title: event.title, url })
      else { await navigator.clipboard.writeText(url); toast.success('Link copied') }
    } catch (err: any) { if (err?.name !== 'AbortError') console.error('Share failed:', err) }
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-5 text-sm text-muted-foreground">
      {checked && <span className="inline-flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" />Last verified {now ? checkedAgo(checked, now) : '…'} from {sourceLabel(event.source)}</span>}
      {original && <a href={original} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">View original listing <ExternalLink className="w-3.5 h-3.5" /></a>}
      <button onClick={share} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 hover:bg-muted text-foreground"><Share2 className="w-3.5 h-3.5" />Share</button>
    </div>
  )
}

function Info({ icon: Icon, title, children }: { icon: typeof Bus; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/50 p-4">
      <h3 className="font-semibold mb-1.5 flex items-center gap-2"><Icon className="w-4 h-4 text-primary" />{title}</h3>
      <div className="text-sm text-muted-foreground space-y-1">{children}</div>
    </div>
  )
}
const NotStated = ({ what }: { what: string }) => <p>The organiser hasn&apos;t listed {what}. Check the original listing or contact the organiser before you go.</p>

/** Map, getting there, organiser, accessibility and age details. */
export function EventExtras({ event }: { event: any }) {
  const place = [event.venueName, event.venueAddress, event.suburb, event.city].filter(Boolean).join(', ')
  const precise = event.latitude != null && event.longitude != null && event.source !== 'promoter'
  const dest = precise ? `${event.latitude},${event.longitude}` : place
  const cat = CATEGORIES.find((c) => c.name === event.category)
  const dir = (mode: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=${mode}`
  const transit = TRANSIT[event.city]
  const age = event.ageRestriction || quote(event.description, AGE_RE)
  const acc = event.accessibilityInfo || quote(event.description, ACC_RE)
  const travel = event.transportInfo || quote(event.description, TRANSPORT_RE)
  const organiser = event.organiserName || event.promoter?.orgName || event.promoter?.name || null
  const organiserLink = event.organiserUrl || event.ticketUrl

  return (
    <div className="border-t border-border pt-6 mt-6 space-y-6">
      <section>
        <h2 className="font-display font-semibold text-lg mb-3 flex items-center gap-2"><MapIcon className="w-5 h-5 text-primary" />Location</h2>
        <div className="relative aspect-[16/9] md:aspect-[21/9] rounded-lg overflow-hidden bg-muted">
          <VenueMap lat={precise ? event.latitude : null} lng={precise ? event.longitude : null} query={place} city={event.city} color={cat?.color ?? '#f9652a'} letter={event.category?.[0] ?? 'E'} label={event.venueName || event.title} />
        </div>
        <p className="text-sm text-muted-foreground mt-2">{place}</p>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <Info icon={Bus} title="Getting there">
          {travel && <p className="text-foreground">{travel}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <a href={dir('transit')} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Public transport directions</a>
            <a href={dir('walking')} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Walking</a>
            <a href={dir('driving')} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Driving</a>
            {transit && <a href={transit.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">{transit.name} trip planner</a>}
          </div>
        </Info>
        <Info icon={Building2} title="Organiser">
          <p className="text-foreground">{organiser ?? `Listed via ${sourceLabel(event.source)}`}</p>
          {organiserLink && <a href={organiserLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Visit the original organiser listing <ExternalLink className="w-3.5 h-3.5" /></a>}
        </Info>
        <Info icon={Accessibility} title="Accessibility">
          {acc ? <p className="text-foreground">{acc}</p> : <NotStated what="accessibility details" />}
        </Info>
        <Info icon={Baby} title="Age restrictions">
          {age ? <p className="text-foreground">{age}</p> : <NotStated what="an age restriction" />}
        </Info>
      </div>
    </div>
  )
}
