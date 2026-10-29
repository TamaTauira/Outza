'use client'

import { useState, useEffect } from 'react'
import { EventImage } from '@/components/event-image'
import Link from 'next/link'
import { ArrowLeft, MapPin, Clock, Calendar, ExternalLink, Tag, Loader2, Bookmark, Megaphone, Users, Info, Share2, Repeat, Banknote } from 'lucide-react'
import { Navbar } from '@/components/navbar'
import { useSaved } from '@/lib/saved'
import { cn } from '@/lib/utils'
import { Footer } from '@/components/footer'
import { EventCard } from '@/components/event-card'
import { CATEGORIES } from '@/lib/categories'
import { StatusBanner } from '@/components/data-confidence'
import { LocalRecommendations } from '@/components/local-recommendations'
import { ItineraryButton } from '@/components/itinerary-button'
import { EventExtras, EventGallery, HERO_FRAME, SourceLine, shareEvent } from './event-extras'
import { ListingTrustActions } from '@/components/listing-trust-actions'
import { ticketHref } from '@/lib/affiliate'
import { BackToEventsLink } from '@/components/back-to-events-link'
import { FollowPromoterButton } from '@/components/follow-promoter-button'
import { FollowListing } from '@/components/follow-listing'
import { AddToPlanButton } from '@/components/add-to-plan'
import { cityDef, displaySuburb } from '@/lib/cities'
import { placeLine } from '@/lib/place'

const REDUNDANT_SCHEDULE = new Set(['Start time listed', 'Start and finish listed'])

function Fact({ icon: Icon, children }: { icon: typeof Calendar; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 min-w-0">
      <Icon className="w-4 h-4 mt-0.5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0">{children}</span>
    </li>
  )
}

export function EventDetailClient({ eventId, initial }: { eventId: string; initial?: { event: any; related: any[]; signedIn?: boolean } }) {
  const [event, setEvent] = useState<any>(initial?.event ?? null)
  const [signedIn, setSignedIn] = useState<boolean>(!!initial?.signedIn)
  const [related, setRelated] = useState<any[]>(initial?.related ?? [])
  const [loading, setLoading] = useState(!initial)
  const { saved, isSaved, toggle } = useSaved()
  const nav = <Navbar savedCount={saved.length} />

  useEffect(() => {
    if (initial) return
    fetch(`/api/events/${eventId}`)
      .then((r) => r.json())
      .then((data) => {
        setEvent(data?.event ?? null)
        setRelated(data?.related ?? [])
        setSignedIn(!!data?.signedIn)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [eventId, initial])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background">
        {nav}
        <div className="text-center py-20">
          <p className="text-4xl mb-4">😔</p>
          <h2 className="font-display text-2xl font-bold mb-2">This one’s done a runner</h2>
          <BackToEventsLink className="text-primary underline">Back to events</BackToEventsLink>
        </div>
      </div>
    )
  }

  const city = cityDef(event.city)
  const suburb = displaySuburb(event.suburb, event.venueAddress, event.city)
  const where = placeLine({ ...event, suburb })
  const dateObj = new Date(event.date)
  const formattedDate = dateObj.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: city.tz })
  const catDef = CATEGORIES.find((c) => c.name === event?.category)
  const schedule = event.quality?.schedule
  const scheduleNote = schedule && !REDUNDANT_SCHEDULE.has(schedule.label) && schedule.label !== 'Start time not listed' ? schedule : null
  const price = event.quality?.price?.range ?? (event?.isFree ? 'Free' : (event?.price ?? 'See website'))
  const availability = event.quality?.status ? null : event.quality?.availability
  const tags: string[] = event?.subTags ?? []
  const savedNow = isSaved(event.id)
  const ticket = event?.ticketUrl ? (ticketHref(event.ticketUrl) ?? event.ticketUrl) : null

  const card = (
    <aside className="rounded-xl border border-border bg-card p-4 shadow-sm lg:sticky lg:top-20 space-y-3">
      <ul className="grid gap-2 text-sm text-foreground">
        <Fact icon={Calendar}>
          <span>{formattedDate}</span>
          {scheduleNote && <span className="block text-xs text-muted-foreground mt-0.5">{scheduleNote.label}. {scheduleNote.detail}</span>}
        </Fact>
        {event?.time ? (
          <Fact icon={Clock}>
            {event.time}{event?.endTime ? ` – ${event.endTime}` : ''}{schedule?.label === 'Runs past midnight' ? ' (next day)' : ''}
            <span className="text-xs text-muted-foreground"> · {city.name} time</span>
          </Fact>
        ) : (
          <Fact icon={Clock}>
            <span className="text-muted-foreground">Start time isn’t on the listing</span>
          </Fact>
        )}
        {(where || event?.venueName) && (
          <Fact icon={MapPin}>
            <span className="font-medium">{where || event.venueName}</span>
          </Fact>
        )}
        {event?.capacity > 0 && (
          <Fact icon={Users}>Capacity {Number(event.capacity).toLocaleString('en-AU')}</Fact>
        )}
        {event.quality?.recurrence && (
          <Fact icon={Repeat}>{event.quality.recurrence}</Fact>
        )}
        <Fact icon={Banknote}>
          <span className="font-semibold">{price}</span>
          {event.quality?.price?.fees && <span className="block text-xs font-normal text-muted-foreground">{event.quality.price.fees}</span>}
          {availability && <span className="block text-xs font-normal text-muted-foreground mt-0.5">Availability: {availability.label}. {availability.note}</span>}
        </Fact>
      </ul>

      {ticket && (
        <a
          href={ticket}
          onClick={() => { navigator.sendBeacon?.(`/api/events/${event.id}/click`) }}
          target="_blank"
          rel={ticketHref(event.ticketUrl) !== event.ticketUrl ? 'sponsored noopener noreferrer' : 'noopener noreferrer'}
          className="flex items-center justify-center gap-2 w-full h-10 bg-primary text-primary-foreground hover:opacity-90 text-sm font-semibold rounded-lg transition-opacity"
        >
          Get Tickets <ExternalLink className="w-4 h-4" />
        </a>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => toggle(event)}
          className={cn('flex items-center justify-center gap-1.5 h-10 rounded-lg border text-sm font-semibold transition-colors', savedNow ? 'border-primary text-primary' : 'border-border hover:bg-muted')}
        >
          <Bookmark className={cn('w-4 h-4', savedNow && 'fill-current')} />
          {savedNow ? 'Saved' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => shareEvent(event)}
          className="flex items-center justify-center gap-1.5 h-10 rounded-lg border border-border text-sm font-semibold hover:bg-muted"
        >
          <Share2 className="w-4 h-4" />Share
        </button>
      </div>
      <ItineraryButton event={event} className="h-10 py-0 text-sm" />
      <AddToPlanButton eventId={event.id} city={event.city} />
    </aside>
  )

  return (
    <div className="min-h-screen bg-background">
      {nav}

      <main className="max-w-[1120px] mx-auto px-4 sm:px-6 py-4 sm:py-5">
        <BackToEventsLink className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to events
        </BackToEventsLink>

        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_19.5rem] lg:gap-x-6 lg:gap-y-4 lg:items-start">
          <header className="min-w-0 space-y-3 lg:col-start-1">
            <EventGallery event={event}>
              <div className={cn(HERO_FRAME, 'rounded-xl border border-border')}>
                <EventImage
                  key={event.id}
                  image={event.imageAsset}
                  src={event.imageUrl}
                  kind="hero"
                  alt={event?.title ?? 'Event'}
                  sizes="(max-width: 1024px) 100vw, 720px"
                  priority
                />
                {event?.isLGBTI && (
                  <div className="absolute top-3 right-3 z-10 rainbow-bg text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow-lg">
                    🏳️‍🌈 LGBTIQ+ Event
                  </div>
                )}
                {event?.isFree && (
                  <div className="absolute z-10 top-3 left-3 bg-emerald-700 text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow-lg">
                    FREE EVENT
                  </div>
                )}
              </div>
            </EventGallery>
            {(event?.category || tags.length > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {event?.category && (
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold text-white" style={{ backgroundColor: catDef?.color ?? '#c2410c' }}>
                    {event.category}
                  </span>
                )}
                {tags.map((tag: string) => (
                  <span key={tag} className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-muted text-muted-foreground">
                    <Tag className="w-3 h-3 inline mr-1" />{tag}
                  </span>
                ))}
              </div>
            )}

            <StatusBanner status={event.quality?.status ?? null} />
            <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight">{event?.title}</h1>
            <SourceLine event={event} />
            <p className="flex items-start gap-1.5 text-xs leading-snug text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              <span>Event details may change. Confirm times, availability and prices with the organiser before attending.</span>
            </p>
            {event?.isMine && (
              <Link href={`/promoter?tab=promote&event=${event.id}`} className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">
                <Megaphone className="w-4 h-4" />Promote this event
              </Link>
            )}
            {event?.promoter && (
              <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-1.5">
                Presented by <Link href={`/organisers/${event.promoter.id}`} className="font-medium text-foreground underline underline-offset-2">{event.promoter.orgName || event.promoter.name || 'a local promoter'}</Link>
                {!event.isMine && <FollowPromoterButton promoterId={event.promoter.id} initialFollowing={!!event.followingPromoter} signedIn={signedIn} />}
              </p>
            )}
            <FollowListing category={event.category} venueName={event.venueName} city={event.city} />
          </header>

          <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2">{card}</div>

          <div className="min-w-0 space-y-4 lg:col-start-1">
            {event?.description && (
              <section>
                <h2 className="font-display font-semibold text-base mb-1.5">The lowdown</h2>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{event.description}</p>
              </section>
            )}
            <EventExtras event={event} />
            <ListingTrustActions event={event} />
          </div>
        </div>

        <LocalRecommendations eventId={event.id} eventTitle={event.title} venue={event.venueName} />

        {(related?.length ?? 0) > 0 && (
          <div className="mt-8">
            <h2 className="font-display text-xl font-bold mb-4">If you like this, you’ll love…</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(related ?? []).slice(0, 6).map((ev: any, i: number) => (
                <EventCard key={ev?.id ?? i} event={ev} index={i} />
              ))}
            </div>
          </div>
        )}
      </main>

      <Footer lastRefresh={null} />
    </div>
  )
}
