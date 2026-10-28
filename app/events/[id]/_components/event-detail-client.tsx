'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { EventImage } from '@/components/event-image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, MapPin, Clock, Calendar, ExternalLink, Tag, Loader2, Bookmark, BadgeCheck, Megaphone } from 'lucide-react'
import { Navbar } from '@/components/navbar'
import { useSaved } from '@/lib/saved'
import { cn } from '@/lib/utils'
import { Footer } from '@/components/footer'
import { EventCard } from '@/components/event-card'
import { CATEGORIES } from '@/lib/categories'
import { DataConfidence, StatusBanner } from '@/components/data-confidence'
import { LocalRecommendations } from '@/components/local-recommendations'
import { ItineraryButton } from '@/components/itinerary-button'
import { EventExtras, EventGallery, VerifiedLine } from './event-extras'
import { ListingTrustActions } from '@/components/listing-trust-actions'
import { ticketHref } from '@/lib/affiliate'
import { BackToEventsLink } from '@/components/back-to-events-link'
import { FollowPromoterButton } from '@/components/follow-promoter-button'
import { displaySuburb } from '@/lib/cities'
import { placeLine } from '@/lib/place'

export function EventDetailClient({ eventId, initial }: { eventId: string; initial?: { event: any; related: any[]; signedIn?: boolean } }) {
  const [event, setEvent] = useState<any>(initial?.event ?? null)
  const [signedIn, setSignedIn] = useState<boolean>(!!initial?.signedIn)
  const [related, setRelated] = useState<any[]>(initial?.related ?? [])
  const [loading, setLoading] = useState(!initial)
  const router = useRouter()
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

  const suburb = displaySuburb(event.suburb, event.venueAddress, event.city)
  const where = placeLine({ ...event, suburb })
  const dateObj = new Date(event.date)
  const formattedDate = dateObj.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Sydney' })
  const catDef = CATEGORIES.find((c) => c.name === event?.category)

  return (
    <div className="min-h-screen bg-background">
      {nav}

      <main className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8">
        <BackToEventsLink className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to events
        </BackToEventsLink>

        <motion.div initial={{ y: 12 }} animate={{ y: 0 }}>
          <div className="bg-card rounded-xl overflow-hidden border border-border">
            {/* Hero image */}
            <EventGallery event={event}>
            <div className="relative aspect-video overflow-hidden bg-muted">
              <EventImage
                key={event.id}
                image={event.imageAsset}
                src={event.imageUrl}
                kind="hero"
                alt={event?.title ?? 'Event'}
                sizes="(max-width: 1280px) 100vw, 1280px"
                priority
              />
              {event?.isLGBTI && (
                <div className="absolute top-4 right-4 rainbow-bg text-white text-sm font-bold px-3 py-1.5 rounded-lg shadow-lg">
                  🏳️‍🌈 LGBTIQ+ Event
                </div>
              )}
              {event?.isFree && (
                <div className="absolute z-10 top-4 left-4 bg-emerald-700 text-white text-sm font-bold px-3 py-1.5 rounded-lg shadow-lg">
                  FREE EVENT
                </div>
              )}
            </div>
            </EventGallery>

            {/* Content */}
            <div className="p-6 md:p-8">
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="px-3 py-1 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: catDef?.color ?? '#c2410c' }}>
                  {event?.category}
                </span>
                {(event?.subTags ?? []).map((tag: string) => (
                  <span key={tag} className="px-3 py-1 rounded-lg text-sm font-medium bg-muted text-muted-foreground">
                    <Tag className="w-3 h-3 inline mr-1" />{tag}
                  </span>
                ))}
              </div>

              <StatusBanner status={event.quality?.status ?? null} />
              <h1 className="font-display text-2xl md:text-4xl font-bold tracking-tight mb-3">{event?.title}</h1>
              <VerifiedLine event={event} />
              {event?.isMine && (
                <Link href={`/promoter?tab=promote&event=${event.id}`} className="mb-5 inline-flex items-center gap-2 h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">
                  <Megaphone className="w-4 h-4" />Promote this event
                </Link>
              )}
              {event?.promoter && (
                <p className="-mt-2 mb-5 text-sm text-muted-foreground flex flex-wrap items-center gap-1.5">
                  Presented by <span className="font-medium text-foreground">{event.promoter.orgName || event.promoter.name || 'a local promoter'}</span>
                  {event.promoter.verified && <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-xs font-semibold"><BadgeCheck className="w-3.5 h-3.5" />Verified promoter</span>}
                  {!event.isMine && <FollowPromoterButton promoterId={event.promoter.id} initialFollowing={!!event.followingPromoter} signedIn={signedIn} />}
                </p>
              )}

              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Calendar className="w-5 h-5 text-primary" />
                    <span>{formattedDate}</span>
                  </div>
                  {event?.time && (
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <Clock className="w-5 h-5 text-primary" />
                      <span>{event.time}{event?.endTime ? ` – ${event.endTime}` : ''}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <MapPin className="w-5 h-5 text-primary" />
                    <div>
                      <span className="font-medium text-foreground">{where || event?.venueName}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-muted/50 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground mb-1">Price</p>
                    <p className="text-2xl font-bold text-foreground">
                      {event.quality?.price?.range ?? (event?.isFree ? 'Free' : (event?.price ?? 'See website'))}
                    </p>
                    {event.quality?.price?.fees && <p className="text-xs text-muted-foreground mt-1">{event.quality.price.fees}</p>}
                  </div>

                  {event?.ticketUrl && (
                    <a
                      href={ticketHref(event.ticketUrl) ?? event.ticketUrl}
                      onClick={() => { navigator.sendBeacon?.(`/api/events/${event.id}/click`) }}
                      target="_blank"
                      rel={ticketHref(event.ticketUrl) !== event.ticketUrl ? 'sponsored noopener noreferrer' : 'noopener noreferrer'}
                      className="flex items-center justify-center gap-2 w-full py-3 bg-primary text-primary-foreground hover:opacity-90 font-semibold rounded-lg transition-all"
                    >
                      Get Tickets <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <ItineraryButton event={event} />
                  <button
                    onClick={() => toggle(event)}
                    className={cn('flex items-center justify-center gap-2 w-full py-3 rounded-lg border font-semibold transition-colors', isSaved(event.id) ? 'border-primary text-primary' : 'border-border hover:bg-muted')}
                  >
                    <Bookmark className={cn('w-4 h-4', isSaved(event.id) && 'fill-current')} />
                    {isSaved(event.id) ? 'Saved to favourites' : 'Save to favourites'}
                  </button>
                  {event.quality && <DataConfidence quality={event.quality} />}
                </div>
              </div>

              {event?.description && (
                <div className="border-t border-border pt-6">
                  <h2 className="font-display font-semibold text-lg mb-3">The lowdown</h2>
                  <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{event.description}</p>
                </div>
              )}
              <EventExtras event={event} />
              <ListingTrustActions event={event} />
            </div>
          </div>
        </motion.div>

        <LocalRecommendations eventId={event.id} eventTitle={event.title} venue={event.venueName} />

        {/* Related events */}
        {(related?.length ?? 0) > 0 && (
          <div className="mt-12">
            <h2 className="font-display text-xl font-bold mb-6">If you like this, you’ll love…</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
