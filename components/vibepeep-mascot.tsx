import { BRAND_MASCOT_HEIGHT, BRAND_MASCOT_SRC, BRAND_MASCOT_WEBP, BRAND_MASCOT_WIDTH } from '@/lib/brand'

/** The brand mascot, cut out with a transparent ground. */
export function VibePeepMascot({
  className = 'w-32',
  alt = 'VibePeep, a round black robot with orange and pink eyes, mid-jump and waving',
  priority = false,
  /** The hero is dark in both themes, so the silhouette needs a rim there too. */
  onDark = false,
}: {
  className?: string
  alt?: string
  priority?: boolean
  onDark?: boolean
}) {
  const rim = onDark
    ? 'drop-shadow-[0_0_12px_rgba(255,255,255,0.42)]'
    : 'dark:drop-shadow-[0_0_12px_rgba(255,255,255,0.42)]'
  return (
    <picture className={`inline-block align-middle ${className}`}>
      <source srcSet={BRAND_MASCOT_WEBP} type="image/webp" />
      <img
        src={BRAND_MASCOT_SRC}
        alt={alt}
        width={BRAND_MASCOT_WIDTH}
        height={BRAND_MASCOT_HEIGHT}
        draggable={false}
        decoding="async"
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        className={`h-auto w-full select-none ${rim}`}
      />
    </picture>
  )
}
