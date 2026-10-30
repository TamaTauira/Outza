'use client'

import { useState } from 'react'
import { VibePeepMark } from '@/components/vibepeep-mark'
import { VibePeepWordmark } from '@/components/vibepeep-logo'
import { srcSet, variantUrl, type ClientImage, type VariantKind } from '@/lib/images/spec'
import { cn } from '@/lib/utils'
import { bestSourceUrl } from '@/lib/images/source-url-client'
import { placeholderSrc } from '@/lib/community-shared'

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
  /** Board category, used to pick a genre placeholder WebP. */
  category?: string | null
  /** Community hub section, when this listing was submitted there. */
  communityKey?: string | null
  className?: string
}

/**
 * Fills its (fixed-aspect, relative) parent. Uses the optimised AVIF/WebP variants when processed,
 * otherwise the source artwork shown whole over a blurred copy of itself (never cropped),
 * otherwise a clearly labelled VibePeep placeholder.
 */
export function EventImage({ image, src: rawSrc, kind, alt, sizes, priority, compact, crop, accent, category, communityKey, className }: Props) {
  // Until variants exist, show the platform's full-resolution original rather than a cropped thumbnail
  const src = bestSourceUrl(rawSrc) ?? rawSrc ?? null
  const m = image?.variants ?? null
  const hasVariants = !!m?.sizes?.[kind]?.length
  const [stage, setStage] = useState<'variant' | 'source' | 'none'>(hasVariants ? 'variant' : src ? 'source' : 'none')
  const loading = priority ? 'eager' : 'lazy'

  const frame = cn('absolute inset-0 w-full h-full', crop ? 'object-cover' : 'object-contain', className)

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
    <div className="absolute inset-0" role="img" aria-label={alt}>
      <img src={placeholderSrc(category, communityKey)} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-white">
        <VibePeepMark className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} decorative />
        {!compact && <VibePeepWordmark tone="on-dark" decorative className="h-3 w-auto" />}
      </span>
    </div>
  )
}
