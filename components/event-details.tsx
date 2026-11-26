import type { ComponentType, ReactNode } from 'react'
import { Banknote, Calendar, Clock, MapPin } from 'lucide-react'
import { COPY } from '@/lib/copy'
import { cn } from '@/lib/utils'

type IconType = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>

/** One fact row. Calendar, clock, price and pin all use this size and colour. */
export function EventDetailRow({ icon: Icon, children }: { icon: IconType; children: ReactNode }) {
  return (
    <li className="flex min-w-0 items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0">{children}</span>
    </li>
  )
}

function DirectionsLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="ml-1.5 inline whitespace-nowrap font-semibold text-primary underline underline-offset-2"
    >
      Directions
    </a>
  )
}

/**
 * Date, time, price and address for an event.
 * Price sits directly under the time. Directions stays on the address line.
 */
export function EventDetails({
  date,
  dateNote,
  time,
  timeZoneLabel,
  price,
  priceNote,
  venue,
  address,
  directionsHref,
  directionsLabel,
  placeNote,
  trailing,
  className,
}: {
  date: ReactNode
  dateNote?: ReactNode
  time?: string | null
  /** City name, rendered as “Sydney time” beside a listed clock. */
  timeZoneLabel?: string | null
  price: string
  priceNote?: ReactNode
  venue?: ReactNode
  address?: ReactNode
  directionsHref?: string | null
  directionsLabel?: string
  placeNote?: ReactNode
  trailing?: ReactNode
  className?: string
}) {
  const zone = timeZoneLabel?.trim()
  const directions = directionsHref ? (
    <DirectionsLink href={directionsHref} label={directionsLabel || 'Directions'} />
  ) : null
  const hasPlace = !!(venue || address || directions || placeNote)

  return (
    <ul className={cn('grid gap-2 text-sm text-foreground', className)}>
      <EventDetailRow icon={Calendar}>
        <span>{date}</span>
        {dateNote ? <span className="mt-0.5 block text-xs text-muted-foreground">{dateNote}</span> : null}
      </EventDetailRow>
      <EventDetailRow icon={Clock}>
        {time ? (
          <>
            <span>{time}</span>
            {zone ? <span className="text-muted-foreground"> · {zone} time</span> : null}
          </>
        ) : (
          <span className="text-muted-foreground">{COPY.timeNotListed}</span>
        )}
      </EventDetailRow>
      <EventDetailRow icon={Banknote}>
        <span className="font-semibold">{price}</span>
        {priceNote ? <span className="block text-xs font-normal text-muted-foreground">{priceNote}</span> : null}
      </EventDetailRow>
      {hasPlace ? (
        <EventDetailRow icon={MapPin}>
          {venue ? <span className="inline">{venue}</span> : null}
          {address ? (
            <span className={venue ? 'block' : undefined}>
              {address}
              {directions}
            </span>
          ) : directions}
          {placeNote ? <span className="mt-0.5 block text-xs text-muted-foreground">{placeNote}</span> : null}
        </EventDetailRow>
      ) : null}
      {trailing}
    </ul>
  )
}
