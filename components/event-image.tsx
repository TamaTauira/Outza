'use client'

import { useState } from 'react'
import { VibePeepMark } from '@/components/vibepeep-mark'
import { VibePeepWordmark, VIBEPEEP_TAGLINE } from '@/components/vibepeep-logo'
import { srcSet, variantUrl, type ClientImage, type VariantKind } from '@/lib/images/spec'
import { cn } from '@/lib/utils'
import { bestSourceUrl } from '@/lib/images/source-url-client'

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
  className?: string
}

/**
 * Fills its (fixed-aspect, relative) parent. Uses the optimised AVIF/WebP variants when processed,
 * otherwise the source artwork shown whole over a blurred copy of itself (never cropped),
 * otherwise a clearly labelled VibePeep placeholder.
 */
export function EventImage({ image, src: rawSrc, kind, alt, sizes, priority, compact, className }: Props) {
  // Until variants exist, show the platform's full-resolution original rather than a cropped thumbnail
  const src = bestSourceUrl(rawSrc) ?? rawSrc ?? null
  const m = image?.variants ?? null
  const hasVariants = !!m?.sizes?.[kind]?.length
  const [stage, setStage] = useState<'variant' | 'source' | 'none'>(hasVariants ? 'variant' : src ? 'source' : 'none')
  const loading = priority ? 'eager' : 'lazy'

  if (stage === 'variant' && m && hasVariants) {
    const widths = m.sizes[kind]!
    const full = variantUrl(m, kind, widths[widths.length - 1], 'webp')
    return (
      <>
        <img src={full} alt="" aria-hidden loading={loading} decoding="async" className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl brightness-[0.6]" />
        <picture>
          <source type="image/avif" srcSet={srcSet(m, kind, 'avif') ?? undefined} sizes={sizes} />
          <source type="image/webp" srcSet={srcSet(m, kind, 'webp') ?? undefined} sizes={sizes} />
          <img
            src={full}
            alt={alt}
            loading={loading}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            className={cn('absolute inset-0 w-full h-full object-contain', className)}
            onError={() => setStage(src ? 'source' : 'none')}
          />
        </picture>
      </>
    )
  }

  if (stage === 'source' && src) {
    return (
      <>
        <img src={src} alt="" aria-hidden loading={loading} decoding="async" className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl brightness-[0.6]" />
        <img
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          className={cn('absolute inset-0 w-full h-full object-contain', className)}
          onError={() => setStage('none')}
        />
      </>
    )
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#161616] via-[#101010] to-[#1f1410] text-center" role="img" aria-label={alt}>
      <VibePeepMark className={compact ? 'w-7 h-7' : 'w-10 h-10'} decorative />
      <span className="flex flex-col items-center leading-none text-white">
        <VibePeepWordmark tone="on-dark" decorative className={compact ? 'h-3.5 w-auto' : 'h-5 w-auto'} />
        {!compact && <span className="mt-1 max-w-[9rem] text-[9px] font-medium leading-tight text-white/70">{VIBEPEEP_TAGLINE}</span>}
      </span>
    </div>
  )
}
