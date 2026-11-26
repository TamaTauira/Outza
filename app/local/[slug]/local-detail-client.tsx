'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { BackLink } from '@/components/back-to-events-link'
import { ArrowLeft, Building2, Bus, ExternalLink, Flag, Map as MapIcon, Repeat, Share2, ShieldCheck, Tag } from 'lucide-react'
import { toast } from 'sonner'
import { Navbar } from '@/components/navbar'
import { EventActionButton, eventActionRowClass } from '@/components/event-action-button'
import { EventDetails } from '@/components/event-details'
import { ItineraryButton } from '@/components/itinerary-button'
import { SaveButton } from '@/components/save-button'
import { EventReactions } from '@/components/event-reactions'
import { AddToPlanButton } from '@/components/add-to-plan'
import { shareEvent } from '@/app/events/[id]/_components/event-extras'
const VenueMap = dynamic(() => import('@/components/venue-map').then((mod) => mod.VenueMap), { ssr: false })
import { EventImage } from '@/components/event-image'
import type { ClientImage } from '@/lib/images/spec'
import { useSaved } from '@/lib/saved'
import { cityDef } from '@/lib/cities'
import { eventDetailPrice } from '@/lib/event-facts'
import { formatDate } from '@/lib/format'
import { fmtDay, fmtTime, localCategoryLabel, localPath, localToBoard } from '@/lib/local-shared'
import { TRANSIT } from '@/app/events/[id]/_components/event-extras'

export interface LocalDetail {
  id: string; title: string; category: string; description: string
  address: string; suburb: string; postcode: string; city: string
  lat: number | null; lng: number | null; addressVerified: boolean
  startDate: string; endDate: string | null; startTime: string; endTime: string
  recurrence: string; recurUntil: string | null; priceNote: string | null
  organiserName: string; websiteUrl: string | null; sourceName: string | null; imageUrl: string | null
  imageAsset: ClientImage | null
  listedAt: string; upcoming: string[]; schedule: string; recurring: boolean
}

const CAT_COLOR: Record<string, string> = { GARAGE: '#b45309', WAREHOUSE: '#475569', MARKET: '#15803d', COMMUNITY: '#7c3aed' }

export function LocalDetailClient({ listing: l, date }: { listing: LocalDetail; date: string }) {
  const { saved, isSaved, toggle, signedIn } = useSaved()
  const priced = eventDetailPrice({ price: l.priceNote, isFree: !!l.priceNote && /^free\b/i.test(l.priceNote.trim()) })
  const city = cityDef(l.city)
  const ev = localToBoard({ ...l, date })
  const stop = { ...ev, venueAddress: `${l.suburb} ${l.postcode}`, lat: l.lat, lng: l.lng, imageUrl: l.imageUrl }
  const place = `${l.address}, ${l.suburb} ${l.postcode}`
  const dest = l.lat != null && l.lng != null ? `${l.lat},${l.lng}` : place
  const dir = (mode: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=${mode}`
  const transit = TRANSIT[l.city]
  const others = l.upcoming.filter((d) => d !== date).slice(0, 8)

  const report = async () => {
    const reason = window.prompt('What is wrong with this listing? (e.g. private event, wrong address, cancelled, prohibited items)')
    if (!reason?.trim()) return
    try {
      const res = await fetch(`/api/local/${l.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim().slice(0, 500) }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Could not send report')
      toast.success('Thanks, our team will review this listing.')
    } catch (err) {
      console.error('Report failed:', err)
      toast.error((err as Error).message)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar savedCount={saved.length} />
      <main className="vp-wrap vp-page-top px-4 pb-8 sm:px-6">
        <BackLink href="/local" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to VibePeep Local
        </BackLink>

        <div className="bg-card rounded-xl overflow-hidden border border-border">
          {l.imageUrl && (
            <div className="relative aspect-[16/9] bg-muted overflow-hidden">
              <EventImage image={l.imageAsset} src={l.imageUrl} kind="hero" alt={`Image supplied by the organiser for ${l.title}`} sizes="(min-width: 1280px) 1280px, 100vw" priority category={l.category} />
            </div>
          )}
          <div className="p-6 md:p-8">
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="px-3 py-1 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: CAT_COLOR[l.category] ?? '#c2410c' }}>{localCategoryLabel(l.category)}</span>
              <span className="px-3 py-1 rounded-lg text-sm font-medium bg-muted text-muted-foreground">
                {l.recurring ? <Repeat className="w-3 h-3 inline mr-1" /> : <Tag className="w-3 h-3 inline mr-1" />}{l.schedule}
              </span>
              <span className="px-3 py-1 rounded-lg text-sm font-medium bg-muted text-muted-foreground">{l.sourceName ? 'Public listing' : 'Community listing'}</span>
            </div>

            <h1 className="font-display text-2xl md:text-4xl font-bold tracking-tight mb-3">{l.title}</h1>
            <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" />{l.sourceName ? `From a public listing on ${l.sourceName} · confirm details on the original page` : 'Listed by the organiser · checked automatically before publishing'}</span>
            </div>

            <div className="mb-6 grid min-w-0 gap-6 md:grid-cols-2">
              <EventDetails
                date={formatDate(date, 'long')}
                time={l.startTime ? `${fmtTime(l.startTime)} – ${fmtTime(l.endTime)}` : null}
                timeZoneLabel={city.name}
                price={priced.label}
                venue={<span className="font-medium">{l.address}</span>}
                address={[l.suburb, l.postcode, city.state].filter(Boolean).join(', ')}
                directionsHref={dir('driving')}
                directionsLabel={`Directions to ${l.title}`}
                placeNote={!l.addressVerified ? (l.sourceName ? 'Address from the original listing and not checked on a map.' : 'Address supplied by the organiser and not checked on a map.') : null}
              />

              <div className="min-w-0 space-y-4">
                {l.websiteUrl && (
                  <a href={l.websiteUrl} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center justify-center gap-2 w-full py-3 bg-primary text-primary-foreground hover:opacity-90 font-semibold rounded-lg transition-all">
                    {l.sourceName ? 'Original listing' : <>Organiser&apos;s page</>} <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                <EventReactions eventId={ev.id} signedIn={signedIn} />
                <div className={eventActionRowClass()}>
                  <SaveButton saved={isSaved(ev.id)} onClick={() => toggle(ev, 'local')} variant="stack" />
                  <ItineraryButton event={stop} stack surface="local" />
                  <AddToPlanButton eventId={ev.id} city={l.city} icon surface="local" className="min-w-0" />
                  <EventActionButton icon={Share2} label="Share" onClick={() => shareEvent({ id: ev.id, title: l.title }, 'local')} />
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-6">
              <h2 className="font-display font-semibold text-lg mb-3">About this listing</h2>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{l.description}</p>
            </div>

            <div className="border-t border-border pt-6 mt-6">
              <h2 className="font-display font-semibold text-lg mb-3 flex items-center gap-2"><MapIcon className="w-5 h-5 text-primary" />Map</h2>
              <div className="relative aspect-[16/9] md:aspect-[21/9] rounded-lg overflow-hidden bg-muted">
                <VenueMap lat={l.lat} lng={l.lng} query={place} city={l.city} label={l.title} />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 border-t border-border pt-6 mt-6">
              <div>
                <h2 className="font-display font-semibold text-lg mb-3 flex items-center gap-2"><Bus className="w-5 h-5 text-primary" />Getting there</h2>
                <div className="flex flex-wrap gap-2">
                  {[['transit', 'Public transport'], ['walking', 'Walking'], ['driving', 'Driving']].map(([m, label]) => (
                    <a key={m} href={dir(m)} target="_blank" rel="noopener noreferrer" className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-border text-sm hover:bg-muted">{label}<ExternalLink className="w-3.5 h-3.5" /></a>
                  ))}
                </div>
                {transit && <p className="mt-3 text-sm text-muted-foreground">Plan your trip with <a href={transit.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">{transit.name}</a>. Street parking at private homes is limited, so please park considerately.</p>}
              </div>
              <div>
                <h2 className="font-display font-semibold text-lg mb-3 flex items-center gap-2"><Building2 className="w-5 h-5 text-primary" />Organiser</h2>
                <p className="font-medium">{l.organiserName}</p>
                {l.websiteUrl
                  ? <a href={l.websiteUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-sm text-primary underline break-all">{l.websiteUrl.replace(/^https?:\/\//, '')}</a>
                  : <p className="text-sm text-muted-foreground">The organiser hasn&apos;t listed a website.</p>}
              </div>
            </div>

            {others.length > 0 && (
              <div className="border-t border-border pt-6 mt-6">
                <h2 className="font-display font-semibold text-lg mb-3">Other upcoming dates</h2>
                <div className="flex flex-wrap gap-2">
                  {others.map((d) => (
                    <Link key={d} href={localPath(l, d)} className="h-9 px-3 inline-flex items-center rounded-md bg-muted text-sm hover:bg-primary hover:text-primary-foreground">{fmtDay(d)}</Link>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-border pt-6 mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground max-w-2xl">{l.sourceName ? (l.imageUrl ? `This listing was imported from ${l.sourceName}. The picture is the one on that listing.` : `This listing was imported from ${l.sourceName}. That page didn’t include a picture.`) : 'Community listings come from their organisers.'} Details can change, so confirm with the organiser before you go. VibePeep doesn&apos;t sell or guarantee anything at this listing. See our <Link href="/disclaimer" className="underline">disclaimer</Link>.</p>
              <button onClick={report} className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border text-sm hover:bg-muted"><Flag className="w-4 h-4" />Report this listing</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
