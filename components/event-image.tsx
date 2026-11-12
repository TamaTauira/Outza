'use client'

import { useState } from 'react'
import { srcSet, variantUrl, type ClientImage, type VariantKind } from '@/lib/images/spec'
import { cn } from '@/lib/utils'
import { bestSourceUrl } from '@/lib/images/source-url-client'
import { placeholderPath, type PlaceholderSlot } from '@/lib/placeholders'

interface Props {
  image?: ClientImage | null
  /** Source artwork URL - used until the optimised variants exist */
  src?: string | null
  kind: VariantKind
  alt: string
  sizes: string
  priority?: boolean
  /** Compact fallback (small cards) */
  compact?: boolean
  /** Fill the frame edge to edge. Used by cards and the short event hero. */
  crop?: boolean
  /** Category colour for the branded placeholder when there is no image. */
  accent?: string
  /** Genre used to pick the placeholder artwork when the event has no picture. */
  category?: string | null
  /** Which holding-image file to use when the listing has no picture. */
  slot?: PlaceholderSlot
  /** Second holding image, used from 640px up. The event hero switches 16:9 → 3:1 here. */
  wideSlot?: PlaceholderSlot
  /** 0 or 1. Local categories keep a second composition so neighbours are not identical. */
  variant?: 0 | 1
  className?: string
}

/**
 * Fills its (fixed-aspect, relative) parent. Uses the optimised AVIF/WebP variants when processed,
 * otherwise the source artwork shown whole over a blurred copy of itself (never cropped),
 * otherwise the genre holding image for this slot, shown whole.
 */
export function EventImage({ image, src: rawSrc, kind, alt, sizes, priority, crop, accent, category, slot, wideSlot, variant = 0, className }: Props) {
  // Until variants exist, show the platform's full-resolution original rather than a cropped thumbnail
  const src = bestSourceUrl(rawSrc) ?? rawSrc ?? null
  const m = image?.variants ?? null
  const hasVariants = !!m?.sizes?.[kind]?.length
  const [stage, setStage] = useState<'variant' | 'source' | 'none'>(hasVariants ? 'variant' : src ? 'source' : 'none')
  const loading = priority ? 'eager' : 'lazy'

  const frame = cn('absolute inset-0 w-full h-full', crop ? 'object-cover' : 'object-contain', className)
  const fallbackSlot: PlaceholderSlot = slot ?? (kind === 'square' ? 'square' : kind === 'featured' ? 'featured' : kind === 'hero' ? 'hero' : 'card')
  const fallbackSrc = placeholderPath(category, fallbackSlot, variant)
  const wideSrc = wideSlot ? placeholderPath(category, wideSlot, variant) : null

  if (stage === 'variant' && m && hasVariants) {
    const widths = m.sizes[kind]!
    const full = variantUrl(m, kind, widths[widths.length - 1], 'webp')
    return (
      <>
        {!crop && <img src={full} alt="" aria-hidden loading={loading} decoding="async" className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl brightness-[0.6]" />}
        <picture>
          <source type="image/avif" srcSet={srcSet(m, kind, 'avif') ?? undefined} sizes={sizes} />
          <source type="image/webp" srcSet={srcSet(m, kind, 'webp') ?? undefined} sizes={sizes} />
          <img
            src={full}
            alt={alt}
            loading={loading}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            className={frame}
            onError={() => setStage(src ? 'source' : 'none')}
          />
        </picture>
      </>
    )
  }

  if (stage === 'source' && src) {
    return (
      <>
        {!crop && <img src={src} alt="" aria-hidden loading={loading} decoding="async" className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl brightness-[0.6]" />}
        <img
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          className={frame}
          onError={() => setStage('none')}
        />
      </>
    )
  }

  return (
    <>
      <picture className="absolute inset-0 block h-full w-full">
        {wideSrc && <source media="(min-width: 640px)" srcSet={wideSrc} />}
        <img
          src={fallbackSrc}
          alt={alt}
          loading={loading}
          decoding="async"
          className={cn('h-full w-full object-cover', className)}
          style={{ background: accent ? `linear-gradient(145deg, ${accent} 0%, #110e16 72%)` : '#110e16' }}
        />
      </picture>
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-1.5 bg-[#fb923c]" />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-1.5 bg-[#f472b6]" />
    </>
  )
}
