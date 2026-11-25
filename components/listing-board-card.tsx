'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { EventImage, eventImageSizes } from '@/components/event-image'
import { ListClock } from '@/components/list-clock'
import { cardPhoto } from '@/lib/card-photo'
import { eventPictureFrom } from '@/lib/images/display-spec'
import type { BoardRange } from '@/lib/listing-window'
import { cn } from '@/lib/utils'

/**
 * Board card. Portrait: image on top, one fixed body. Landscape phone: image on
 * the left, two equal columns. Title and venue each stay on one line.
 */
export function ListingBoardCard({
  rowId,
  title,
  href,
  imageUrl,
  imageCategory,
  imageWidth,
  imageHeight,
  imageColor,
  imageBlur,
  imageDisplay,
  venue,
  tag,
  accent,
  priceText,
  priceKind,
  when,
  hot,
  onHot,
  onOpen,
  actions,
  icon: Icon,
}: {
  rowId?: string
  title: string
  href: string
  imageUrl?: string | null
  imageCategory?: string | null
  imageWidth?: number | null
  imageHeight?: number | null
  imageColor?: string | null
  imageBlur?: string | null
  imageDisplay?: unknown
  venue: string
  tag: string
  accent: string
  priceText: string
  priceKind: 'free' | 'paid' | 'unknown'
  when: BoardRange
  hot?: boolean
  onHot?: (on: boolean) => void
  onOpen?: () => void
  actions: ReactNode
  icon?: LucideIcon
}) {
  const photo = cardPhoto(imageUrl)
  return (
    <article
      data-vp-card="board"
      data-row={rowId}
      onMouseEnter={() => onHot?.(true)}
      onMouseLeave={() => onHot?.(false)}
      onClick={onOpen ? (event) => {
        if ((event.target as HTMLElement).closest('a,button,input,select,label')) return
        onOpen()
      } : undefined}
      className={cn('vp-board-card', hot && 'bg-primary/10', onOpen && 'cursor-pointer')}
    >
      <span className="vp-board-media">
        <EventImage
          src={photo}
          picture={eventPictureFrom({ imageWidth, imageHeight, imageColor, imageBlur, imageDisplay })}
          sourceWidth={imageWidth}
          sourceHeight={imageHeight}
          category={imageCategory}
          slot="featured"
          kind="featured"
          alt=""
          sizes={eventImageSizes('board')}
        />
      </span>
      <div className="vp-board-body">
        <div className="vp-board-line">
          <Link href={href} scroll={false} className="vp-board-title after:absolute after:inset-0 after:z-0 after:content-[''] focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-primary">{title}</Link>
          <span className="vp-board-slot"><ListClock when={when} part="start" /></span>
        </div>
        <div className="vp-board-line">
          <p className="vp-board-venue">{venue}</p>
          <span className="vp-board-slot"><ListClock when={when} part="end" /></span>
        </div>
        <div className="vp-board-foot">
          <span className="vp-board-foot-main">
            {tag ? (
              <span className="vp-chip" style={{ backgroundColor: `color-mix(in srgb, ${accent} 28%, #151a19)`, color: '#F5F5F2' }}>
                {Icon ? <Icon className="h-3 w-3 shrink-0" aria-hidden /> : null}
                <span>{tag}</span>
              </span>
            ) : null}
            <span className={cn('vp-price', priceKind === 'free' && 'is-free')}>{priceText}</span>
          </span>
          <span className="relative z-20 flex shrink-0 items-center">{actions}</span>
        </div>
      </div>
    </article>
  )
}
