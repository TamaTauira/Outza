'use client'

import { useState } from 'react'
import { OutzaMark } from '@/components/outza-mark'
import { OUTZA_TAGLINE } from '@/components/outza-logo'
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
  /** Detail hero with no artwork: category colour and the event title. */
  fallback?: { color: string; title: string }
}

/**
 * Fills its (fixed-aspect, relative) parent. Uses the optimised AVIF/WebP variants when processed,
 * otherwise the source artwork shown whole over a blurred copy of itself (never cropped),
 * otherwise a clearly labelled Outza placeholder.
 */
export function EventImage({ image, src: rawSrc, kind, alt, sizes, priority, compact, className, fallback }: Props) {
  // Until variants exist, show the platform's full-resolution original rather than a cropped thumbnail
  const src = bestSourceUrl(rawSrc) ?? rawSrc ?? null
  const m = image?.variants ?? null
  const hasVariants = !!m?.sizes?.[kind]?.length
  const [stage, setStage] = useState<'variant' | 'source' | 'none'>(hasVariants ? 'variant' : src ? 'source' : 'none')
  const loading = priority ? 'eager' : 'lazy'

  if (stage === 'variant' && m && hasVariants) {
    const widths = m.sizes[kind]!
    return (
      <picture>
        <source type="image/avif" srcSet={srcSet(m, kind, 'avif') ?? undefined} sizes={sizes} />
        <source type="image/webp" srcSet={srcSet(m, kind, 'webp') ?? undefined} sizes={sizes} />
        <img
          src={variantUrl(m, kind, widths[widths.length - 1], 'webp')}
          alt={alt}
          loading={loading}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          className={cn('absolute inset-0 w-full h-full object-cover', className)}
          onError={() => setStage(src ? 'source' : 'none')}
        />
      </picture>
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

  if (fallback) {
    const color = /^#[0-9a-fA-F]{3,8}$/.test(fallback.color) ? fallback.color : '#f9652a'
    return (
      <div className="absolute inset-0" role="img" aria-label={alt} style={{ backgroundColor: color }}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/20" />
        <div className="absolute inset-x-0 bottom-0 z-10 p-6 md:p-10 text-white">
          <div className="mb-3 inline-flex items-center gap-2">
            <OutzaMark className="w-8 h-8" />
            <span className="flex flex-col leading-none">
              <span className="font-display font-extrabold tracking-tight text-base">OUTZA<span className="text-[#f9652a]">.</span></span>
              <span className="mt-1 font-mono uppercase tracking-[0.16em] text-sm text-white/90">{OUTZA_TAGLINE}</span>
            </span>
          </div>
          <p className="font-display text-2xl md:text-4xl font-bold leading-tight line-clamp-3">{fallback.title}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#161616] via-[#101010] to-[#1f1410] text-center" role="img" aria-label={alt}>
      <OutzaMark className={compact ? 'w-7 h-7' : 'w-10 h-10'} />
      <span className="flex flex-col items-center leading-none">
        <span className={cn('font-display font-extrabold tracking-tight text-white', compact ? 'text-[11px]' : 'text-base')}>OUTZA<span className="text-primary">.</span></span>
        <span className={cn('mt-1 font-mono uppercase tracking-[0.18em] text-white/70', compact ? 'text-[7px]' : 'text-[9px]')}>{OUTZA_TAGLINE}</span>
      </span>
    </div>
  )
}
