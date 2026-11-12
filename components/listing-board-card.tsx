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
  actions,
  variant = 0,
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
  actions: ReactNode
  variant?: 0 | 1
}) {
  const photo = cardPhoto(imageUrl)
  return (
    <article
      data-row={rowId}
      onMouseEnter={() => onHot?.(true)}
      onMouseLeave={() => onHot?.(false)}
      className={cn('flex min-w-0 gap-3 rounded-2xl border border-border bg-card p-3', hot && 'bg-primary/10')}
      style={{ boxShadow: `inset 3px 0 0 ${accent}` }}
    >
      <span className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#110e16]">
        <EventImage src={photo} category={imageCategory} slot="square" kind="square" crop={!!photo} alt="" sizes="80px" variant={variant} />
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
