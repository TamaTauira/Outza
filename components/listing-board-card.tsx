'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { EventImage } from '@/components/event-image'
import { cardPhoto } from '@/lib/card-photo'
import { cn } from '@/lib/utils'

/** Local-style board card: square picture, title, place and time, a tag, then the actions passed in. */
export function ListingBoardCard({
  rowId,
  title,
  href,
  imageUrl,
  imageCategory,
  meta,
  tag,
  accent,
  price,
  hot,
  onHot,
  onOpen,
  media,
  actions,
}: {
  rowId?: string
  title: string
  href: string
  imageUrl?: string | null
  imageCategory?: string | null
  meta: string
  tag: string
  accent: string
  price?: ReactNode
  hot?: boolean
  onHot?: (on: boolean) => void
  onOpen?: () => void
  /** Image-led card for the Board view. The list timetable stays a row. */
  media?: boolean
  actions: ReactNode
}) {
  const photo = cardPhoto(imageUrl)
  if (media) {
    return (
      <article
        data-row={rowId}
        onMouseEnter={() => onHot?.(true)}
        onMouseLeave={() => onHot?.(false)}
        onClick={onOpen ? (event) => {
          if ((event.target as HTMLElement).closest('a,button,input,select,label')) return
          onOpen()
        } : undefined}
        className={cn('flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card', hot && 'bg-primary/10', onOpen && 'cursor-pointer')}
      >
        <span className="relative block aspect-[16/10] overflow-hidden" style={{ background: accent }}>
          <EventImage src={photo} category={imageCategory} slot="featured" kind="featured" crop={!!photo} alt="" sizes="(min-width: 1280px) 30vw, 100vw" />
        </span>
        <div className="min-w-0 flex-1 p-3">
          <Link href={href} scroll={false} className="block font-semibold leading-snug line-clamp-2 hover:text-primary">{title}</Link>
          {meta && <p className="mt-0.5 text-sm text-muted-foreground">{meta}</p>}
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate">{tag}</span>
              {price}
            </span>
            <span className="flex shrink-0 items-center">{actions}</span>
          </div>
        </div>
      </article>
    )
  }
  return (
    <article
      data-row={rowId}
      onMouseEnter={() => onHot?.(true)}
      onMouseLeave={() => onHot?.(false)}
      onClick={onOpen ? (event) => {
        if ((event.target as HTMLElement).closest('a,button,input,select,label')) return
        onOpen()
      } : undefined}
      className={cn('flex min-w-0 gap-3 rounded-2xl border border-border bg-card p-3', hot && 'bg-primary/10', onOpen && 'cursor-pointer')}
      style={{ boxShadow: `inset 3px 0 0 ${accent}` }}
    >
      <span className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#110e16]">
        <EventImage src={photo} category={imageCategory} slot="square" kind="square" crop={!!photo} alt="" sizes="80px" />
      </span>
      <div className="min-w-0 flex-1">
        <Link href={href} scroll={false} className="block font-semibold leading-snug line-clamp-2 hover:text-primary">{title}</Link>
        {meta && <p className="mt-0.5 text-sm text-muted-foreground">{meta}</p>}
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">{tag}</span>
            {price}
          </span>
          <span className="flex shrink-0 items-center">{actions}</span>
        </div>
      </div>
    </article>
  )
}
