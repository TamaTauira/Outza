'use client'

import { useEffect, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useRouter } from 'next/navigation'
import { Bookmark, Calendar, Clock, ExternalLink, MapPin, Share2, Tag, X } from 'lucide-react'
import { EventImage } from '@/components/event-image'
import { ItineraryButton } from '@/components/itinerary-button'
import { VenueMap } from '@/components/venue-map'
import { CATEGORIES } from '@/lib/categories'
import { cityDef, displaySuburb } from '@/lib/cities'
import { descriptionParagraphs } from '@/lib/description-text'
import { ticketHref } from '@/lib/affiliate'
import { eventOutbound } from '@/lib/listing-link'
import { boardClockLine } from '@/lib/listing-window'
import { mapsDirectionsUrl, placeLine } from '@/lib/place'
import { useSaved, type SavedEvent } from '@/lib/saved'
import { fullPageNavigation } from '@/lib/full-page-nav'
import { eventPath } from '@/lib/seo'
import { shareEvent } from '@/app/events/[id]/_components/event-extras'
import { cn } from '@/lib/utils'

type PeekEvent = {
  id: string
  title: string
  description?: string | null
  date: string
  endDate?: string | null
  time?: string | null
  endTime?: string | null
  allDay?: boolean | null
  startsAt?: string | null
  endsAt?: string | null
  venueName?: string | null
  venueAddress?: string | null
  suburb?: string | null
  city?: string | null
  category?: string | null
  subTags?: string[] | null
  isFree?: boolean | null
  isLGBTI?: boolean | null
  price?: string | null
  imageUrl?: string | null
  imageAsset?: unknown
  latitude?: number | null
  longitude?: number | null
  ticketUrl?: string | null
  sourceUrl?: string | null
  organiserUrl?: string | null
  source?: string | null
  communityKey?: string | null
  quality?: { price?: { range?: string | null } | null } | null
}

/** Event opened over the page you were on. The address is the real event URL. */
export function EventPeek({ event }: { event: PeekEvent }) {
  const router = useRouter()
  const sheet = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; dy: number } | null>(null)
  const closing = useRef(false)
  const path = eventPath(event)
  const { isSaved, toggle } = useSaved()
  const saved = isSaved(event.id)
  const savedEvent: SavedEvent = {
    id: event.id,
    title: event.title,
    description: event.description ?? null,
    date: event.date,
    endDate: event.endDate ?? null,
    time: event.time ?? null,
    endTime: event.endTime ?? null,
    allDay: event.allDay ?? undefined,
    startsAt: event.startsAt ?? null,
    endsAt: event.endsAt ?? null,
    venueName: event.venueName ?? '',
    suburb: event.suburb ?? null,
    category: event.category ?? '',
    subTags: event.subTags ?? [],
    isLGBTI: !!event.isLGBTI,
    isFree: !!event.isFree,
    price: event.price ?? null,
    venueAddress: event.venueAddress,
    ticketUrl: event.ticketUrl ?? null,
    city: event.city ?? undefined,
    latitude: event.latitude,
    longitude: event.longitude,
  }

  const close = () => {
    if (closing.current) return
    closing.current = true
    router.back()
  }

  useEffect(() => {
    const onPop = () => { closing.current = true }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const city = cityDef(event.city)
  const suburb = displaySuburb(event.suburb, event.venueAddress, event.city)
  const where = placeLine({ ...event, suburb })
  const dateLabel = new Date(event.date).toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: city.tz,
  })
  const clock = boardClockLine(event)
  const cat = CATEGORIES.find((item) => item.name === event.category)
  const price = event.quality?.price?.range ?? (event.isFree ? 'Free' : (event.price || 'See website'))
  const tags = event.subTags ?? []
  const paragraphs = descriptionParagraphs(event.description)
  const outbound = eventOutbound(event)
  const sponsored = outbound.kind === 'ticket' && !!event.ticketUrl && (ticketHref(event.ticketUrl) ?? event.ticketUrl) !== event.ticketUrl
  const mapsHref = mapsDirectionsUrl({
    latitude: event.latitude,
    longitude: event.longitude,
    venueAddress: event.venueAddress,
    venueName: event.venueName,
    suburb,
    city: event.city,
  })

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!window.matchMedia('(max-width: 639px)').matches) return
    drag.current = { y: e.clientY, dy: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !sheet.current) return
    const dy = Math.max(0, e.clientY - drag.current.y)
    drag.current.dy = dy
    sheet.current.style.transform = `translateY(${dy}px)`
  }
  const onPointerUp = () => {
    const dy = drag.current?.dy ?? 0
    drag.current = null
    if (!sheet.current) return
    if (dy > 96) {
      close()
      return
    }
    sheet.current.style.transform = ''
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) close() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          ref={sheet}
          aria-modal="true"
          aria-describedby="event-peek-summary"
          onCloseAutoFocus={(e) => {
            const link = document.querySelector<HTMLElement>(`a[href="${path}"], a[href^="${path}?"]`)
            if (!link) return
            e.preventDefault()
            link.focus()
          }}
          className={cn(
            'fixed z-[80] flex flex-col overflow-hidden bg-background text-foreground shadow-2xl outline-none',
            'inset-x-0 bottom-0 top-10 rounded-t-3xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom data-[state=closed]:duration-200 data-[state=open]:duration-300',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[min(88dvh,860px)] sm:w-[min(56rem,calc(100vw-3rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl',
            'sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:slide-out-to-bottom-0',
          )}
        >
          <div
            className="flex shrink-0 cursor-grab touch-none justify-center py-2 sm:hidden"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <span className="h-1.5 w-12 rounded-full bg-muted-foreground/40" aria-hidden />
            <span className="sr-only">Drag down to close</span>
          </div>
          <Dialog.Close className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-black/70 text-white hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:right-4 sm:top-4" aria-label="Close">
            <X className="h-5 w-5" />
          </Dialog.Close>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="relative aspect-[16/9] bg-[#110e16] sm:aspect-[2/1]">
              <EventImage
                image={event.imageAsset as never}
                src={event.imageUrl}
                kind="hero"
                alt=""
                sizes="(max-width: 640px) 100vw, 900px"
                crop
                accent={cat?.color}
                category={event.communityKey || event.category}
                slot="hero"
                wideSlot="hero-wide"
              />
              {event.isFree && <span className="absolute left-3 top-3 rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-bold text-white">Free</span>}
            </div>
            <div className="space-y-4 px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-wrap gap-1.5">
                {event.category && (
                  <span className="rounded-md px-2.5 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: cat?.color ?? '#c2410c' }}>{event.category}</span>
                )}
                {tags.map((tag) => (
                  <span key={tag} className="rounded-md bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"><Tag className="mr-1 inline h-3 w-3" />{tag}</span>
                ))}
              </div>
              <Dialog.Title className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{event.title}</Dialog.Title>
              <p id="event-peek-summary" className="sr-only">{[dateLabel, clock, where].filter(Boolean).join('. ')}</p>
              <ul className="grid gap-2 text-sm">
                <li className="flex items-start gap-2"><Calendar className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /><span>{dateLabel}</span></li>
                <li className="flex items-start gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /><span>{clock || 'Time not listed'}{city.name ? ` · ${city.name} time` : ''}</span></li>
                {(where || event.venueName) && (
                  <li className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span>
                      <span className="font-medium">{event.venueName}</span>
                      {suburb ? <span className="text-muted-foreground"> · {suburb}</span> : null}
                      {mapsHref ? <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="mt-0.5 block text-primary underline underline-offset-2">Directions</a> : null}
                    </span>
                  </li>
                )}
                <li className="font-semibold">{price}</li>
              </ul>
              {paragraphs.length > 0 && (
                <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                  {paragraphs.slice(0, 4).map((paragraph) => <p key={paragraph.slice(0, 32)} className="whitespace-pre-line">{paragraph}</p>)}
                </div>
              )}
              <div className="relative h-44 overflow-hidden rounded-2xl border border-border bg-muted">
                <VenueMap
                  lat={event.latitude}
                  lng={event.longitude}
                  query={[event.venueAddress, event.venueName, suburb, event.city].filter(Boolean).join(', ')}
                  city={event.city}
                  color={cat?.color}
                  letter={event.category?.[0] ?? 'E'}
                  label={event.venueName || event.title}
                />
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)] gap-1.5">
                <button type="button" onClick={() => toggle(savedEvent)} className={cn('flex h-11 items-center justify-center gap-1 whitespace-nowrap rounded-xl border px-1.5 text-[11px] font-semibold sm:text-xs', saved ? 'border-primary text-primary' : 'border-border')}>
                  <Bookmark className={cn('h-4 w-4 shrink-0', saved && 'fill-current')} /> {saved ? 'Saved' : 'Save'}
                </button>
                <ItineraryButton event={savedEvent} outline />
                <button type="button" onClick={() => shareEvent(event)} className="flex h-11 items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-border px-1.5 text-[11px] font-semibold sm:text-xs">
                  <Share2 className="h-4 w-4 shrink-0" /> Share
                </button>
              </div>
              <a
                href={outbound.href}
                target="_blank"
                rel={sponsored ? 'sponsored noopener noreferrer' : 'noopener noreferrer'}
                onClick={() => {
                  const kind = outbound.kind === 'ticket' ? 'ticket' : 'info'
                  const body = new Blob([JSON.stringify({ kind })], { type: 'application/json' })
                  navigator.sendBeacon?.(`/api/events/${event.id}/click`, body)
                }}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground"
              >
                {outbound.label} <ExternalLink className="h-4 w-4" />
              </a>
              <a
                href={path}
                onClick={(click) => {
                  click.preventDefault()
                  const href = click.currentTarget.href
                  if (fullPageNavigation(window.location.pathname, href) === 'reload') window.location.reload()
                  else window.location.assign(href)
                }}
                className="block text-center text-sm text-muted-foreground underline underline-offset-2"
              >
                Open the full page
              </a>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
