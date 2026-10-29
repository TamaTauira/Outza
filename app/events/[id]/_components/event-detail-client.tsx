'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { EventImage } from '@/components/event-image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, MapPin, Clock, Calendar, ExternalLink, Tag, Loader2, Bookmark, Megaphone, Users, Info, Share2 } from 'lucide-react'
import { Navbar } from '@/components/navbar'
import { useSaved } from '@/lib/saved'
import { cn } from '@/lib/utils'
import { Footer } from '@/components/footer'
import { EventCard } from '@/components/event-card'
import { CATEGORIES } from '@/lib/categories'
import { StatusBanner } from '@/components/data-confidence'
import { LocalRecommendations } from '@/components/local-recommendations'
import { ItineraryButton } from '@/components/itinerary-button'
import { EventExtras, EventGallery, VerifiedLine } from './event-extras'
import { ListingTrustActions } from '@/components/listing-trust-actions'
import { ticketHref } from '@/lib/affiliate'
import { BackToEventsLink } from '@/components/back-to-events-link'
import { FollowPromoterButton } from '@/components/follow-promoter-button'
import { FollowListing } from '@/components/follow-listing'
import { AddToPlanButton } from '@/components/add-to-plan'
import { cityDef, displaySuburb } from '@/lib/cities'
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

      <main className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 pb-28 sm:pb-8">
        <BackToEventsLink className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to events
        </BackToEventsLink>

        <motion.div initial={{ y: 12 }} animate={{ y: 0 }}>
          <div className="bg-card rounded-xl overflow-hidden border border-border">
            {/* Hero image */}
            <EventGallery event={event}>
            <div className="relative h-[200px] overflow-hidden bg-muted sm:h-[240px]">
              <EventImage
                key={event.id}
                image={event.imageAsset}
                src={event.imageUrl}
                kind="hero"
                alt={event?.title ?? 'Event'}
                sizes="(max-width: 1280px) 100vw, 1280px"
                priority
                crop
                accent={catDef?.color}
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
              <FollowListing category={event.category} venueName={event.venueName} city={event.city} />
              {event?.isMine && (
                <Link href={`/promoter?tab=promote&event=${event.id}`} className="mb-5 inline-flex items-center gap-2 h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">
                  <Megaphone className="w-4 h-4" />Promote this event
                </Link>
              )}
              {event?.promoter && (
                <p className="-mt-2 mb-5 text-sm text-muted-foreground flex flex-wrap items-center gap-1.5">
                  Presented by <Link href={`/organisers/${event.promoter.id}`} className="font-medium text-foreground underline underline-offset-2">{event.promoter.orgName || event.promoter.name || 'a local promoter'}</Link>
                  {!event.isMine && <FollowPromoterButton promoterId={event.promoter.id} initialFollowing={!!event.followingPromoter} signedIn={signedIn} />}
                </p>
              )}

              {(() => {
                const priceLabel = event.quality?.price?.range ?? (event?.isFree ? 'Free' : (event?.price ?? 'See website'))
                const ticket = event?.ticketUrl ? (ticketHref(event.ticketUrl) ?? event.ticketUrl) : null
                const share = () => {
                  const url = window.location.href
                  if (navigator.share) navigator.share({ title: event.title, url }).catch(() => {})
                  else navigator.clipboard?.writeText(url).catch(() => {})
                }
                const tickets = ticket && (
                  <a
                    href={ticket}
                    onClick={() => { navigator.sendBeacon?.(`/api/events/${event.id}/click`) }}
                    target="_blank"
                    rel={ticketHref(event.ticketUrl) !== event.ticketUrl ? 'sponsored noopener noreferrer' : 'noopener noreferrer'}
                    className="flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-foreground hover:opacity-90"
                  >
                    Get Tickets <ExternalLink className="w-4 h-4" />
                  </a>
                )
                return (
                  <>
                  <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <div>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <Calendar className="w-5 h-5 text-primary" />
                          <span>{formattedDate}{event.quality?.schedule ? ` · ${event.quality.schedule.label}` : ''}</span>
                        </div>
                        {event?.time && (
                          <div className="flex items-center gap-3 text-muted-foreground">
                            <Clock className="w-5 h-5 text-primary" />
                            <span>{event.time}{event?.endTime ? ` – ${event.endTime}` : ''}{event.quality?.schedule?.label === 'Runs past midnight' ? ' (next day)' : ''} <span className="text-xs">{cityDef(event.city).name} time</span></span>
                          </div>
                        )}
                        {event?.capacity > 0 && (
                          <div className="flex items-center gap-3 text-muted-foreground">
                            <Users className="w-5 h-5 text-primary" />
                            <span>Capacity {Number(event.capacity).toLocaleString('en-AU')}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <MapPin className="w-5 h-5 text-primary" />
                          <span className="font-medium text-foreground">{where || event?.venueName}</span>
                        </div>
                      </div>
                      {event?.description && (
                        <div className="mt-6">
                          <h2 className="mb-2 font-display text-lg font-semibold">The lowdown</h2>
                          <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{event.description}</p>
                        </div>
                      )}
                      <EventExtras event={event} />
                      <ListingTrustActions event={event} />
                    </div>
                    <aside className="hidden sm:block">
                      <div className="sticky top-20 space-y-3 rounded-xl border border-border bg-card p-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Price</p>
                          <p className="text-2xl font-bold">{priceLabel}</p>
                          {event.quality?.price?.fees && <p className="mt-1 text-xs text-muted-foreground">{event.quality.price.fees}</p>}
                        </div>
                        <p className="flex items-start gap-2 text-xs leading-snug text-muted-foreground">
                          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                          Confirm times, availability and prices with the organiser before attending.
                        </p>
                        {tickets}
                        <div className="grid grid-cols-4 gap-2">
                          <button type="button" onClick={() => toggle(event)} className={cn('flex h-10 flex-col items-center justify-center rounded-lg border text-[10px] font-semibold', isSaved(event.id) ? 'border-primary text-primary' : 'border-border hover:bg-muted')} aria-label={isSaved(event.id) ? 'Saved' : 'Save'}>
                            <Bookmark className={cn('h-4 w-4', isSaved(event.id) && 'fill-current')} />Save
                          </button>
                          <ItineraryButton event={event} compact className="h-10 w-full rounded-lg" />
                          <AddToPlanButton eventId={event.id} city={event.city} icon />
                          <button type="button" onClick={share} className="flex h-10 flex-col items-center justify-center rounded-lg border border-border text-[10px] font-semibold hover:bg-muted" aria-label="Share">
                            <Share2 className="h-4 w-4" />Share
                          </button>
                        </div>
                      </div>
                    </aside>
                  </div>
                  <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:hidden">
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">Price</p>
                        <p className="truncate font-bold">{priceLabel}</p>
                      </div>
                      <div className="ml-auto">{tickets}</div>
                      <details className="relative">
                        <summary className="flex h-12 cursor-pointer list-none items-center rounded-lg border border-border px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">More</summary>
                        <div className="absolute bottom-14 right-0 z-50 w-64 space-y-2 rounded-xl border border-border bg-card p-3 shadow-xl">
                          <ItineraryButton event={event} />
                          <AddToPlanButton eventId={event.id} city={event.city} />
                          <button type="button" onClick={() => toggle(event)} className="flex w-full items-center justify-center gap-2 rounded-lg border border-border py-3 text-sm font-semibold">
                            <Bookmark className={cn('h-4 w-4', isSaved(event.id) && 'fill-current')} />{isSaved(event.id) ? 'Saved' : 'Save'}
                          </button>
                          <button type="button" onClick={share} className="flex w-full items-center justify-center gap-2 rounded-lg border border-border py-3 text-sm font-semibold"><Share2 className="h-4 w-4" />Share</button>
                        </div>
                      </details>
                  </div>
                </>
                )
              })()}
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
