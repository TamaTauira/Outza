'use client'

import { useState } from 'react'
import Image from 'next/image'
import { variantUrl, type ClientImage, type VariantKind } from '@/lib/images/spec'
import { displayMasterUrl, type EventPicture } from '@/lib/images/display-spec'
import { cn } from '@/lib/utils'
import { bestSourceUrl, canOptimizeImage, displaySourceUrl } from '@/lib/images/source-url-client'
import { placeholderPath, type PlaceholderSlot } from '@/lib/placeholders'
import { bitmapIsLowQuality, declaredPhotoIsLowQuality, hasStoredPhotoSize, storedPhotoIsLowQuality } from '@/lib/images/listing-photo'

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
  /** Kept for callers. Photos are contained over a blurred copy, never cropped. */
  crop?: boolean
  /** Unused. Category colour used to paint a band behind the photo. */
  accent?: string
  /** Genre used to pick the placeholder artwork when the event has no picture. */
  category?: string | null
  /** Which holding-image file to use when the listing has no picture. */
  slot?: PlaceholderSlot
  /** Second holding image, used from 640px up. The event hero switches 16:9 → 3:1 here. */
  wideSlot?: PlaceholderSlot
  className?: string
  /** Resized AVIF/WebP plus blur and natural size, when ingest has stored them. */
  picture?: EventPicture | null
  /** Source pixel size when the derivative manifest is not ready yet. */
  sourceWidth?: number | null
  sourceHeight?: number | null
}

/**
 * Fills its (fixed-aspect, relative) parent.
 * A real photo sits contained over a blurred, darkened copy of itself, with a
 * black gradient that is heavy at the top and solid at the bottom.
 * A missing or low-quality photo is the genre holding image, with no colour band.
 */
export function EventImage({
  image,
  src: rawSrc,
  kind,
  alt,
  sizes,
  priority,
  category,
  slot,
  wideSlot,
  className,
  picture: pictureProp,
  sourceWidth,
  sourceHeight,
}: Props) {
  const stored = bestSourceUrl(rawSrc) ?? rawSrc ?? null
  const displayWidth = kind === 'hero' ? 1200 : kind === 'featured' ? 800 : kind === 'square' ? 200 : 640
  const src = displaySourceUrl(stored, displayWidth) ?? stored
  const manifest = image?.variants ?? null
  const variantWidths = manifest?.sizes?.[kind]
  const hasVariants = !!variantWidths?.length
  const width = pictureProp?.width ?? sourceWidth ?? null
  const height = pictureProp?.height ?? sourceHeight ?? null
  const knownSize = hasStoredPhotoSize(width, height)
  const storedLow = storedPhotoIsLowQuality(width, height, pictureProp?.lowQuality)
  const urlLow = declaredPhotoIsLowQuality(src)
  const stage = (storedLow || urlLow)
    ? null
    : pictureProp && !pictureProp.lowQuality
      ? { src: displayMasterUrl(pictureProp, 'webp'), optimized: true }
      : hasVariants && manifest && variantWidths
        ? { src: variantUrl(manifest, kind, variantWidths[variantWidths.length - 1], 'webp'), optimized: false }
        : src
          ? { src, optimized: canOptimizeImage(src) }
          : null
  const [probeKey, setProbeKey] = useState('')
  const [probeBad, setProbeBad] = useState(false)
  const [probeRatio, setProbeRatio] = useState<number | null>(null)

  const identity = stage?.src ?? ''
  const probed = probeKey === identity
  const low = storedLow || urlLow || (probed && probeBad)
  const ratio = ratioOf(width, height) ?? (probed ? probeRatio : null)
  const waiting = !low && !knownSize && !!stage && !probed

  if (low || !stage) {
    return (
      <HoldingImage
        alt={alt}
        category={category}
        slot={slot}
        wideSlot={wideSlot}
        kind={kind}
        priority={priority}
        className={className}
      />
    )
  }

  const onMeasured = (img: HTMLImageElement | null) => {
    if (!img) {
      setProbeKey(identity)
      setProbeBad(true)
      setProbeRatio(null)
      return
    }
    const nextRatio = img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : null
    setProbeKey(identity)
    setProbeBad(knownSize ? false : bitmapIsLowQuality(img))
    setProbeRatio(nextRatio)
  }

  return (
    <span className={cn('vp-photo', waiting && 'is-pending')} aria-busy={waiting || undefined}>
      <span className="vp-photo-blur" aria-hidden>
        <StageImage src={stage.src} alt="" sizes={sizes} optimized={stage.optimized} blur />
      </span>
      <span className="vp-photo-shade" aria-hidden />
      <span className={cn('vp-photo-fit', !ratio && 'is-open')} style={ratio ? { ['--vp-ratio' as string]: String(ratio) } : undefined}>
        <StageImage
          src={stage.src}
          alt={alt}
          sizes={sizes}
          optimized={stage.optimized}
          priority={priority}
          className={cn('vp-photo-feather', className)}
          onLoad={onMeasured}
          onError={() => onMeasured(null)}
        />
      </span>
    </span>
  )
}

function ratioOf(width?: number | null, height?: number | null): number | null {
  if (!width || !height || width < 1 || height < 1) return null
  return width / height
}

function StageImage({
  src,
  alt,
  sizes,
  optimized,
  priority,
  blur,
  className,
  onLoad,
  onError,
}: {
  src: string
  alt: string
  sizes: string
  optimized: boolean
  priority?: boolean
  blur?: boolean
  className?: string
  onLoad?: (img: HTMLImageElement) => void
  onError?: () => void
}) {
  const fit = cn(blur ? 'vp-photo-blur-img object-cover' : 'object-contain', className)
  if (optimized) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        quality={75}
        priority={!!priority && !blur}
        className={fit}
        onLoad={onLoad ? (event) => onLoad(event.currentTarget) : undefined}
        onError={onError}
      />
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      loading={priority && !blur ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority && !blur ? 'high' : 'auto'}
      className={cn('absolute inset-0 h-full w-full', fit)}
      onLoad={onLoad ? (event) => onLoad(event.currentTarget) : undefined}
      onError={onError}
    />
  )
}

function HoldingImage({
  alt,
  category,
  slot,
  wideSlot,
  kind,
  priority,
  className,
}: {
  alt: string
  category?: string | null
  slot?: PlaceholderSlot
  wideSlot?: PlaceholderSlot
  kind: VariantKind
  priority?: boolean
  className?: string
}) {
  const fallbackSlot: PlaceholderSlot = slot ?? (kind === 'square' ? 'square' : kind === 'featured' ? 'featured' : kind === 'hero' ? 'hero' : 'card')
  const fallbackSrc = placeholderPath(category, fallbackSlot)
  const wideSrc = wideSlot ? placeholderPath(category, wideSlot) : null
  return (
    <picture className="absolute inset-0 block h-full w-full bg-black">
      {wideSrc && <source media="(min-width: 640px)" srcSet={wideSrc} />}
      <img
        src={fallbackSrc}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className={cn('h-full w-full object-cover', className)}
      />
    </picture>
  )
}
