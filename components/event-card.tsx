'use client'

import { motion } from 'framer-motion'
import { MapPin, Clock, ExternalLink, Tag } from 'lucide-react'
import Link from 'next/link'
import { EventImage } from '@/components/event-image'
import type { ClientImage } from '@/lib/images/spec'
import { cn } from '@/lib/utils'
import { CATEGORIES } from '@/lib/categories'
import { ItineraryButton } from '@/components/itinerary-button'
import { eventPath } from '@/lib/seo'
import { formatPrice } from '@/lib/board'
import { displayTitle } from '@/lib/display-public'
import { displaySuburb, tidyVenueName } from '@/lib/cities'
import { boardClockLine } from '@/lib/listing-window'
interface EventData {
  id: string
  title: string
  description?: string | null
  date: string
  time: string | null
  venueName: string
  suburb: string | null
  category: string
  subTags: string[]
  isLGBTI: boolean
  isFree: boolean
  price: string | null
  priceMin?: number | null
  priceMax?: number | null
  imageUrl: string | null
  imageAsset?: ClientImage | null
  venueAddress?: string | null
  city?: string | null
  ticketUrl: string | null
  organiserUrl?: string | null
  source?: string | null
  communityKey?: string | null
  availabilityKind?: 'possibly'
}

export function EventCard({ event, index, listingQuery }: { event: EventData; index: number; listingQuery?: string }) {
  const clock = boardClockLine(event)
  const dateObj = new Date(event.date)
  const day = dateObj.getUTCDate()
  const month = dateObj.toLocaleDateString('en-AU', { month: 'short', timeZone: 'UTC' })
  const catDef = CATEGORIES.find((c) => c.name === event.category)
  const price = formatPrice(event.isFree, event.price, event.priceMin, event.priceMax)
  const suburb = displaySuburb(event.suburb, event.venueAddress, event.city)
  const title = displayTitle(event.title)

  return (
    <motion.div
      className="h-full"
      initial={{ y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.5) }}
    >
      <Link href={listingQuery ? `${eventPath(event)}?${listingQuery}` : eventPath(event)} scroll={false} className="block h-full group">
        <div className="flex h-full flex-col overflow-hidden rounded-[var(--vp-radius-lg)] border border-border bg-card transition-colors duration-300 group-hover:border-[var(--vp-border-default)]">
          {/* Image */}
          <div className="relative aspect-[4/3] overflow-hidden" style={{ background: `linear-gradient(145deg, ${catDef?.color ?? '#FF7A35'}, #1a120c)` }}>
            <EventImage
              image={event.imageAsset}
              src={event.imageUrl}
              kind="card"
              alt={title}
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              crop
              accent={catDef?.color}
              category={event.communityKey || event.category}
              slot="card"
            />

            {/* Date badge */}
            <div className="absolute z-10 top-3 left-3 bg-white/95 dark:bg-card/95 backdrop-blur-sm rounded-lg px-2.5 py-1.5 text-center shadow-md">
              <div className="text-lg font-bold text-primary leading-none">{day}</div>
              <div className="text-xs font-medium text-muted-foreground uppercase">{month}</div>
            </div>

            {/* Free badge */}
            {event.isFree && (
              <div className="absolute z-10 top-3 right-3 rounded-[var(--vp-radius-sm)] bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white">
                Free
              </div>
            )}

            <ItineraryButton event={event} compact className="absolute z-10 bottom-3 left-3" />

            {/* LGBTI badge */}
            {event.isLGBTI && (
              <div className="absolute z-10 bottom-3 right-3 rainbow-bg text-white text-xs font-bold px-2.5 py-1 rounded-md shadow-md">
                🏳️‍🌈 LGBTIQ+
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-4 space-y-2">
            {/* Category + sub-tags */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="rounded-md px-2 py-0.5 text-xs font-semibold"
                style={{ backgroundColor: `color-mix(in srgb, ${catDef?.color ?? '#FF7A35'} 28%, #151a19)`, color: '#F5F5F2' }}
              >
                {event.category}
              </span>
              {(event.subTags ?? []).slice(0, 2).map((tag: string) => (
                <span key={tag} className="px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>

            <h3 className="font-display font-semibold text-base leading-snug line-clamp-2 group-hover:text-primary transition-colors">
              {title}
            </h3>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {tidyVenueName(event.venueName, event.venueAddress, event.city)}
                {suburb && <span className="text-muted-foreground">· {suburb}</span>}
              </span>
            </div>

            {clock && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                {clock}
              </div>
            )}
            {event.availabilityKind === 'possibly' && (
              <p className="text-xs text-muted-foreground">Time not listed</p>
            )}

            {/* Price + CTA */}
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {price.kind === 'unknown' ? 'See website' : [price.prefix, price.value].filter(Boolean).join(' ')}
              </span>
              <span className="flex items-center gap-1 text-xs font-semibold text-primary transition-all group-hover:gap-2">
                Get tickets <ExternalLink className="w-3 h-3" />
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

/** Compact row: date, category, title, place, price. No poster. Search and other lists use this. */
export function EventCardRow({ event, listingQuery }: { event: EventData; listingQuery?: string }) {
  const catDef = CATEGORIES.find((c) => c.name === event.category)
  const price = formatPrice(event.isFree, event.price, event.priceMin, event.priceMax)
  const suburb = displaySuburb(event.suburb, event.venueAddress, event.city)
  const clock = boardClockLine(event)
  const dateObj = new Date(event.date)
  const when = Number.isNaN(dateObj.getTime())
    ? null
    : dateObj.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const priceText = price.kind === 'unknown' ? 'See website' : [price.prefix, price.value].filter(Boolean).join(' ')
  return (
    <Link href={listingQuery ? `${eventPath(event)}?${listingQuery}` : eventPath(event)} scroll={false} className="grid min-h-11 grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 hover:bg-muted/60">
      <span className="text-xs font-medium text-muted-foreground">{when ?? 'Date TBC'}</span>
      <span className="min-w-0">
        <span className="line-clamp-2 font-semibold leading-snug">{displayTitle(event.title)}</span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0 rounded-md px-1.5 py-0.5 font-semibold" style={{ backgroundColor: `color-mix(in srgb, ${catDef?.color ?? '#FF7A35'} 28%, #151a19)`, color: '#F5F5F2' }}>{event.category}</span>
          <span className="truncate">{[clock, tidyVenueName(event.venueName, event.venueAddress, event.city), suburb].filter(Boolean).join(' · ')}</span>
        </span>
      </span>
      <span className={cn('shrink-0 text-sm font-semibold tabular-nums', price.kind === 'free' ? 'text-free' : 'text-foreground')}>{priceText}</span>
    </Link>
  )
}

/** Two-line city-guide row used under the desktop card breakpoint. */
export function GuideEventRow({ event, listingQuery }: { event: EventData; listingQuery?: string }) {
  const catDef = CATEGORIES.find((c) => c.name === event.category)
  const color = catDef?.color ?? '#FF7A35'
  const price = formatPrice(event.isFree, event.price, event.priceMin, event.priceMax)
  const suburb = displaySuburb(event.suburb, event.venueAddress, event.city)
  const clock = boardClockLine(event)
  return (
    <Link href={listingQuery ? `${eventPath(event)}?${listingQuery}` : eventPath(event)} scroll={false} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md" style={{ background: `linear-gradient(145deg, ${color}, #1a120c)` }}>
        <EventImage image={event.imageAsset} src={event.imageUrl} kind="square" alt="" sizes="64px" crop accent={color} category={event.communityKey || event.category} slot="square" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold leading-snug">{displayTitle(event.title)}</p>
        <p className="truncate text-sm text-muted-foreground">
          {event.availabilityKind === 'possibly' ? 'Time not listed' : (clock ?? 'All day')} · {tidyVenueName(event.venueName, event.venueAddress, event.city)}{suburb ? ` · ${suburb}` : ''}
        </p>
      </div>
      <span className={cn('shrink-0 font-mono text-sm', price.kind === 'free' ? 'text-free' : 'text-foreground')}>{[price.prefix, price.value].filter(Boolean).join(' ')}</span>
    </Link>
  )
}
