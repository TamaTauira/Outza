'use client'

import { useState, useEffect } from 'react'
import { EventImage, eventImageSizes } from '@/components/event-image'
import { eventPictureFrom } from '@/lib/images/display-spec'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Tag, Loader2, Megaphone, Users, Info, Share2, Repeat } from 'lucide-react'
import { EventActionButton, eventActionRowClass } from '@/components/event-action-button'
import { EventDetailRow, EventDetails } from '@/components/event-details'
import { SaveButton } from '@/components/save-button'
import { Navbar } from '@/components/navbar'
import { useSaved } from '@/lib/saved'
import { cn } from '@/lib/utils'
import { EventCard } from '@/components/event-card'
import { BRAND_ORANGE } from '@/lib/brand'
import { CATEGORIES } from '@/lib/categories'
import { StatusBanner } from '@/components/data-confidence'
import { LocalRecommendations } from '@/components/local-recommendations'
import { ItineraryButton } from '@/components/itinerary-button'
import { EventExtras, EventGallery, HERO_FRAME, HERO_HOLD, shareEvent } from './event-extras'
import { hasListingPhoto } from '@/lib/placeholders'
import { declaredPhotoIsLowQuality, storedPhotoIsLowQuality } from '@/lib/images/listing-photo'
import { ListingTrustActions } from '@/components/listing-trust-actions'
import { eventOutbound } from '@/lib/listing-link'
import { BackToEventsLink } from '@/components/back-to-events-link'
import { FollowPromoterButton } from '@/components/follow-promoter-button'
import { FollowListing } from '@/components/follow-listing'
import { AddToPlanButton } from '@/components/add-to-plan'
import { cityDef, displaySuburb } from '@/lib/cities'
import { cityPath, isPastEvent } from '@/lib/seo'
import { eventDetailPrice } from '@/lib/event-facts'
import { boardClockLine } from '@/lib/listing-window'
import { displayTitle } from '@/lib/display-public'
import { formatDate } from '@/lib/format'
import { mapsDirectionsUrl, placeLine } from '@/lib/place'
import { descriptionParagraphs } from '@/lib/description-text'
import { OrganiserUpdateNotice } from '@/components/organiser-update-notice'
import { ClaimedTick } from '@/components/ClaimedTick'
import { EventReactions } from '@/components/event-reactions'
import { ListingSources } from '@/components/listing-sources'

const REDUNDANT_SCHEDULE = new Set(['Start time listed', 'Start and finish listed'])

function Lowdown({ text }: { text: string }) {
  const paragraphs = descriptionParagraphs(text)
  if (!paragraphs.length) return null
  return (
    <section>
      <h2 className="font-display font-semibold text-base mb-1.5">The lowdown</h2>
      <div className="vp-measure space-y-3 text-sm leading-relaxed text-muted-foreground">
        {paragraphs.map((paragraph, index) => (
          <p key={`${index}-${paragraph.slice(0, 24)}`} className="whitespace-pre-line">{paragraph}</p>
        ))}
      </div>
    </section>
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
        <div className="text-center py-8">
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
  const addressText = typeof event.venueAddress === 'string' ? event.venueAddress.trim() : ''
  const venueLabel = typeof event.venueName === 'string' ? event.venueName.trim() : ''
  const showAddress = !!addressText && addressText !== venueLabel
  const nameLabel = venueLabel || (showAddress ? '' : where)
  const mapsHref = mapsDirectionsUrl({
    latitude: event.latitude,
    longitude: event.longitude,
    venueAddress: addressText,
    venueName: event.venueName,
    suburb,
    city: event.city,
  })
  const formattedDate = formatDate(typeof event.date === 'string' ? event.date : new Date(event.date).toISOString(), 'long')
  const clock = boardClockLine({
    date: event.date,
    endDate: event.endDate,
    time: event.time,
    endTime: event.endTime,
    city: event.city,
    allDay: event.allDay,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
  })
  const catDef = CATEGORIES.find((c) => c.name === event?.category)
  const schedule = event.quality?.schedule
  const scheduleNote = schedule && !REDUNDANT_SCHEDULE.has(schedule.label) && schedule.label !== 'Start time not listed' ? schedule : null
  const priced = eventDetailPrice({
    isFree: event?.isFree,
    price: event?.price,
    priceMin: event?.priceMin,
    priceMax: event?.priceMax,
    range: event.quality?.price?.range,
  })
  const price = priced.label
  const tags: string[] = event?.subTags ?? []
  const savedNow = isSaved(event.id)
  const outbound = eventOutbound(event)
  const ended = isPastEvent({
    date: event.date,
    endDate: event.endDate,
    time: event.time,
    endTime: event.endTime,
    endsAt: event.endsAt,
    allDay: event.allDay,
    city: event.city,
  })
  const sourceLink = (className: string) => outbound && (
    <a
      href={outbound.href}
      onClick={() => {
        const kind = outbound.kind === 'ticket' ? 'ticket' : 'info'
        const body = new Blob([JSON.stringify({ kind })], { type: 'application/json' })
        navigator.sendBeacon?.(`/api/events/${event.id}/click`, body)
      }}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {outbound.label} <ExternalLink className="h-4 w-4" />
    </a>
  )
  const ticketClass = 'flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-4 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90'

  const card = (
    <aside className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
      <EventDetails
        date={formattedDate}
        dateNote={scheduleNote ? `${scheduleNote.label}. ${scheduleNote.detail}` : null}
        time={clock}
        timeZoneLabel={clock ? city.name : null}
        price={price}
        priceNote={priced.kind === 'paid' && outbound?.kind === 'ticket' && event.quality?.price?.fees ? event.quality.price.fees : null}
        venue={nameLabel ? (
          <span className="inline-flex flex-wrap items-center gap-1">
            {event?.venueId ? (
              <Link href={`/venues/${event.venueId}`} className="font-medium underline underline-offset-2">{nameLabel}</Link>
            ) : (
              <span className="font-medium">{nameLabel}</span>
            )}
            {event?.venueManagedLabel ? <ClaimedTick kind="venue" /> : null}
          </span>
        ) : null}
        address={showAddress ? addressText : null}
        directionsHref={(where || event?.venueName) ? mapsHref : null}
        directionsLabel={`Directions to ${nameLabel || event.title}`}
        placeNote={event?.venueManagedLabel || null}
        trailing={(
          <>
            {event?.capacity > 0 ? <EventDetailRow icon={Users}>Capacity {Number(event.capacity).toLocaleString('en-AU')}</EventDetailRow> : null}
            {event.quality?.recurrence ? <EventDetailRow icon={Repeat}>{event.quality.recurrence}</EventDetailRow> : null}
          </>
        )}
      />

      {outbound && !ended ? sourceLink(`${ticketClass} w-full`) : outbound ? sourceLink('inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary underline underline-offset-2') : <p className="text-sm text-muted-foreground">No ticket link yet</p>}
      {!ended && (
        <div data-print-hide>
          <EventReactions eventId={event.id} signedIn={signedIn} />
        </div>
      )}
      <div data-print-hide className={eventActionRowClass(ended)}>
        {!ended && <SaveButton saved={savedNow} onClick={() => toggle(event)} variant="stack" />}
        {!ended && <ItineraryButton event={event} stack />}
        {!ended && <AddToPlanButton eventId={event.id} city={event.city} icon className="min-w-0" />}
        <EventActionButton icon={Share2} label="Share" onClick={() => shareEvent(event)} />
      </div>
    </aside>
  )

  return (
    <div className="min-h-screen bg-background">
      {nav}

      <main className="vp-wrap vp-page-top px-4 pb-36 sm:px-6 lg:pb-5">
        <BackToEventsLink className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to events
        </BackToEventsLink>

        <div className="flex flex-col gap-[var(--vp-card-gap)] lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-[var(--vp-card-gap)]">
          <header className="min-w-0 space-y-3 lg:col-start-1">
            <EventGallery event={event}>
              <div className={cn(hasListingPhoto(event.imageUrl, event.imageAsset?.variants) && !storedPhotoIsLowQuality(event.imageWidth, event.imageHeight) && !declaredPhotoIsLowQuality(event.imageUrl) ? HERO_FRAME : HERO_HOLD, 'rounded-xl border border-border')}>
                <EventImage
                  key={event.id}
                  image={event.imageAsset}
                  picture={eventPictureFrom(event)}
                  src={event.imageUrl}
                  sourceWidth={event.imageWidth}
                  sourceHeight={event.imageHeight}
                  kind="hero"
                  alt={event?.title ?? 'Event'}
                  sizes={eventImageSizes('page')}
                  priority
                  category={event.communityKey || event.category}
                  slot="hero"
                  wideSlot="hero-wide"
                />
                {event?.isLGBTI && (
                  <div className="absolute top-3 right-3 z-10 rainbow-bg text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow-lg">
                    🏳️‍🌈 LGBTIQ+ Event
                  </div>
                )}
                {event?.isFree && (
                  <div className="absolute left-3 top-3 z-10 rounded-[var(--vp-radius-sm)] bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white">
                    Free
                  </div>
                )}
              </div>
            </EventGallery>
            {(event?.category || tags.length > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {event?.category && (
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold text-white" style={{ backgroundColor: catDef?.color ?? BRAND_ORANGE }}>
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
            {ended && (
              <div className="rounded-xl border border-border bg-card px-4 py-3" role="status">
                <p className="font-display text-lg font-bold">This event has ended</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  It was on {formattedDate}{where ? ` · ${where}` : ''}. This page stays up, so a link from a message, a calendar or a share still opens.
                </p>
                <Link href={cityPath(city)} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-2">
                  See what’s on in {city.name}
                </Link>
              </div>
            )}
            <h1 className="font-display text-h1 font-bold">{displayTitle(event?.title)}</h1>
            {event?.provenance && <ListingSources provenance={event.provenance} />}
            {event?.venueUpdate && <OrganiserUpdateNotice notice={event.venueUpdate} kind="venue" />}
            {event?.organiserUpdate && <OrganiserUpdateNotice notice={event.organiserUpdate} />}
            {event?.listingCaution && <p className="text-xs text-muted-foreground">{event.listingCaution}</p>}
            <p className="flex items-start gap-1.5 text-xs leading-snug text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              <span>Event details may change. Confirm times, availability and prices with the organiser before attending.</span>
            </p>
            {event?.isMine && (
              <Link href={`/promoter?tab=promote&event=${event.id}`} className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">
                <Megaphone className="w-4 h-4" />Promote this event
              </Link>
            )}
            {event?.canManageListing && (
              <Link href={`/events/${event.id}/manage`} className="inline-flex text-sm text-muted-foreground underline underline-offset-2">Manage this event</Link>
            )}
            {event?.promoter && (
              <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-1.5">
                Presented by <Link href={`/organisers/${event.promoter.id}`} className="font-medium text-foreground underline underline-offset-2">{event.promoter.orgName || event.promoter.name || 'a local promoter'}</Link>
                {event.organiserClaimed && <ClaimedTick kind="organiser" />}
                {!event.isMine && <FollowPromoterButton promoterId={event.promoter.id} initialFollowing={!!event.followingPromoter} signedIn={signedIn} />}
              </p>
            )}
            <FollowListing category={event.category} venueName={event.venueName} city={event.city} />
          </header>

          <div className="lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:row-span-2">{card}</div>

          <div className="min-w-0 space-y-4 lg:col-start-1">
            {event?.description ? <Lowdown text={event.description} /> : null}
            <EventExtras event={event} />
            <div data-print-hide>
              <ListingTrustActions event={event} />
            </div>
          </div>
        </div>

        <div data-print-hide>
          <LocalRecommendations eventId={event.id} eventTitle={event.title} venue={event.venueName} />
        </div>

        {(related?.length ?? 0) > 0 && (
          <div className="mt-8" data-print-hide>
            <h2 className="font-display text-xl font-bold mb-4">{ended ? 'Similar events coming up' : 'If you like this, you’ll love…'}</h2>
            <div className="grid grid-cols-1 items-stretch gap-[var(--vp-card-gap)] md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {(related ?? []).slice(0, 6).map((ev: any, i: number) => (
                <EventCard key={ev?.id ?? i} event={ev} index={i} />
              ))}
            </div>
          </div>
        )}
      </main>

      {!ended && (
        <div className="vp-ticket-bar fixed inset-x-0 z-30 border-t border-border bg-background/95 px-4 py-2 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">{price}</p>
            {outbound ? sourceLink(`${ticketClass} shrink-0`) : <p className="shrink-0 text-sm text-muted-foreground">No ticket link yet</p>}
          </div>
        </div>
      )}
    </div>
  )
}
