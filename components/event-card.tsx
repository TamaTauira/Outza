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
import { displaySuburb, tidyVenueName } from '@/lib/cities'
interface EventData {
  id: string
  title: string
  description: string | null
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
  source?: string | null
  availabilityKind?: 'possibly'
}

export function EventCard({ event, index }: { event: EventData; index: number }) {
  const dateObj = new Date(event.date)
  const day = dateObj.getUTCDate()
  const month = dateObj.toLocaleDateString('en-AU', { month: 'short', timeZone: 'UTC' })
  const catDef = CATEGORIES.find((c) => c.name === event.category)
  const price = formatPrice(event.isFree, event.price, event.priceMin, event.priceMax)
  const suburb = displaySuburb(event.suburb, event.venueAddress, event.city)

  return (
    <motion.div
      initial={{ y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.5) }}
    >
      <Link href={eventPath(event)} className="block group">
        <div className="bg-card rounded-xl overflow-hidden shadow-[var(--shadow-md)] hover:shadow-[var(--shadow-lg)] transition-all duration-300 group-hover:-translate-y-1">
          {/* Image */}
          <div className="relative aspect-[4/3] overflow-hidden" style={{ background: `linear-gradient(145deg, ${catDef?.color ?? '#FF7A1A'}, #1a120c)` }}>
            <EventImage
              image={event.imageAsset}
              src={event.imageUrl}
              kind="card"
              alt={event.title}
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              crop
              accent={catDef?.color}
              category={event.category}
            />

            {/* Date badge */}
            <div className="absolute z-10 top-3 left-3 bg-white/95 dark:bg-card/95 backdrop-blur-sm rounded-lg px-2.5 py-1.5 text-center shadow-md">
              <div className="text-lg font-bold text-primary leading-none">{day}</div>
              <div className="text-[10px] font-medium text-muted-foreground uppercase">{month}</div>
            </div>

            {/* Free badge */}
            {event.isFree && (
              <div className="absolute z-10 top-3 right-3 bg-emerald-700 text-white text-xs font-bold px-2.5 py-1 rounded-md shadow-md">
                FREE
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
                className="px-2 py-0.5 rounded-md text-[11px] font-semibold text-white"
                style={{ backgroundColor: catDef?.color ?? '#FF7A1A' }}
              >
                {event.category}
              </span>
              {(event.subTags ?? []).slice(0, 2).map((tag: string) => (
                <span key={tag} className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>

            <h3 className="font-display font-semibold text-base leading-snug line-clamp-2 group-hover:text-primary transition-colors">
              {event.title}
            </h3>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {tidyVenueName(event.venueName, event.venueAddress, event.city)}
                {suburb && <span className="text-muted-foreground/60">· {suburb}</span>}
              </span>
            </div>

            {event.time && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                {event.time}
              </div>
            )}
            {event.availabilityKind === 'possibly' && (
              <p className="text-xs text-muted-foreground">Possibly available</p>
            )}

            {/* Price + CTA */}
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <span className="text-sm font-semibold text-foreground">
                {price.kind === 'unknown' ? 'See website' : [price.prefix, price.value].filter(Boolean).join(' ')}
              </span>
              <span className="flex items-center gap-1 text-xs font-medium text-primary group-hover:gap-2 transition-all">
                Get Tickets <ExternalLink className="w-3 h-3" />
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

/** Two-line city-guide row used under the desktop card breakpoint. */
export function GuideEventRow({ event }: { event: EventData }) {
  const catDef = CATEGORIES.find((c) => c.name === event.category)
  const color = catDef?.color ?? '#FF7A1A'
  const price = formatPrice(event.isFree, event.price, event.priceMin, event.priceMax)
  const suburb = displaySuburb(event.suburb, event.venueAddress, event.city)
  return (
    <Link href={eventPath(event)} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md" style={{ background: `linear-gradient(145deg, ${color}, #1a120c)` }}>
        <EventImage image={event.imageAsset} src={event.imageUrl} kind="square" alt="" sizes="64px" compact crop accent={color} category={event.category} shape="square" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold leading-snug">{event.title}</p>
        <p className="truncate text-sm text-muted-foreground">
          {event.availabilityKind === 'possibly' ? 'Possibly available' : (event.time ?? 'All day')} · {tidyVenueName(event.venueName, event.venueAddress, event.city)}{suburb ? ` · ${suburb}` : ''}
        </p>
      </div>
      <span className={cn('shrink-0 font-mono text-sm', price.kind === 'free' ? 'text-free' : 'text-foreground')}>{price.value}</span>
    </Link>
  )
}
