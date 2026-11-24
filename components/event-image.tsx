'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { srcSet, variantUrl, type ClientImage, type VariantKind } from '@/lib/images/spec'
import { displayMasterUrl, type EventPicture } from '@/lib/images/display-spec'
import { cn } from '@/lib/utils'
import { bestSourceUrl, canOptimizeImage, displaySourceUrl } from '@/lib/images/source-url-client'
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
  className?: string
  /** Resized AVIF/WebP plus blur and natural size, when ingest has stored them. */
  picture?: EventPicture | null
}

/**
 * Fills its (fixed-aspect, relative) parent. Uses the optimised AVIF/WebP variants when processed,
 * otherwise the source artwork shown whole over a blurred copy of itself (never cropped),
 * otherwise the genre holding image for this slot, shown whole.
 */
export function EventImage({ image, src: rawSrc, kind, alt, sizes, priority, crop, accent, category, slot, wideSlot, className, picture: pictureProp }: Props) {
  // Until variants exist, show the platform's full-resolution original rather than a cropped thumbnail
  const stored = bestSourceUrl(rawSrc) ?? rawSrc ?? null
  const displayWidth = kind === 'hero' ? 1200 : kind === 'featured' ? 800 : kind === 'square' ? 200 : 640
  const src = displaySourceUrl(stored, displayWidth) ?? stored
  const m = image?.variants ?? null
  const hasVariants = !!m?.sizes?.[kind]?.length
  const [stage, setStage] = useState<'variant' | 'source' | 'none'>(hasVariants ? 'variant' : src ? 'source' : 'none')
  const [soft, setSoft] = useState(false)
  if (pictureProp) {
    return <DisplayPhoto picture={pictureProp} alt={alt} sizes={sizes} priority={priority} crop={crop} className={className} />
  }
  const noteSize = (img: HTMLImageElement) => {
    if (img.naturalWidth > 0 && img.clientWidth > img.naturalWidth + 1) setSoft(true)
  }
  const loading = priority ? 'eager' : 'lazy'

  const frame = cn('absolute inset-0 w-full h-full', soft || !crop ? 'object-contain' : 'object-cover', className)
  const fallbackSlot: PlaceholderSlot = slot ?? (kind === 'square' ? 'square' : kind === 'featured' ? 'featured' : kind === 'hero' ? 'hero' : 'card')
  const fallbackSrc = placeholderPath(category, fallbackSlot)
  const wideSrc = wideSlot ? placeholderPath(category, wideSlot) : null

  if (stage === 'variant' && m && hasVariants) {
    const widths = m.sizes[kind]!
    const full = variantUrl(m, kind, widths[widths.length - 1], 'webp')
    return (
      <>
        {(soft || !crop) && <img src={full} alt="" aria-hidden loading={loading} decoding="async" className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl brightness-[0.6]" />}
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
            onLoad={(event) => noteSize(event.currentTarget)}
            onError={() => setStage(src ? 'source' : 'none')}
          />
        </picture>
      </>
    )
  }

  if (stage === 'source' && src) {
    if (canOptimizeImage(src)) {
      return (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          quality={75}
          priority={!!priority}
          className={frame}
          onLoad={(event) => noteSize(event.currentTarget)}
          onError={() => setStage('none')}
        />
      )
    }
    return (
      <>
        {(soft || !crop) && <img src={src} alt="" aria-hidden loading={loading} decoding="async" className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl brightness-[0.6]" />}
        <img
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          className={frame}
          onLoad={(event) => noteSize(event.currentTarget)}
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
          style={{ background: accent ? `linear-gradient(145deg, ${accent} 0%, var(--vp-banner) 72%)` : 'var(--vp-banner)' }}
        />
      </picture>
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-1.5 bg-brand-orange" />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-1.5 bg-brand-pink" />
    </>
  )
}

/** Stored AVIF/WebP at the size on screen. Small artwork sits on a blurred copy instead of being stretched. */
function DisplayPhoto({ picture, alt, sizes, priority, crop, className }: {
  picture: EventPicture
  alt: string
  sizes: string
  priority?: boolean
  crop?: boolean
  className?: string
}) {
  const frameRef = useRef<HTMLSpanElement>(null)
  const [soft, setSoft] = useState(false)
  const [ready, setReady] = useState(false)
  const natural = picture.width ?? picture.widths[picture.widths.length - 1] ?? 0
  useEffect(() => {
    const node = frameRef.current
    if (!node || !natural) return
    const check = () => setSoft(node.clientWidth > natural + 1)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(node)
    return () => observer.disconnect()
  }, [natural])
  const contain = soft || !crop
  const src = displayMasterUrl(picture, 'webp')
  return (
    <span ref={frameRef} className="absolute inset-0 block">
      {contain && picture.blur ? (
        <span aria-hidden className="absolute inset-0 scale-110 bg-cover blur-2xl brightness-[0.6]" style={{ backgroundImage: `url(${picture.blur})` }} />
      ) : null}
      {!ready && (
        <span aria-hidden className="absolute inset-0 animate-pulse" style={{ background: picture.color || '#110e16' }} />
      )}
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        quality={75}
        priority={!!priority}
        placeholder={picture.blur ? 'blur' : 'empty'}
        blurDataURL={picture.blur || undefined}
        className={cn('absolute inset-0 h-full w-full', contain ? 'object-contain' : 'object-cover', className)}
        onLoad={() => setReady(true)}
      />
    </span>
  )
}
