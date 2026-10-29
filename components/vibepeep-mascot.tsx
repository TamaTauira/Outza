import Image from 'next/image'
import { BRAND_MASCOT_HEIGHT, BRAND_MASCOT_SRC, BRAND_MASCOT_WIDTH } from '@/lib/brand'

/** The brand mascot, cut out with a transparent ground. */
export function VibePeepMascot({
  className = 'w-32',
  alt = 'VibePeep, a round black robot with orange and pink eyes, mid-jump and waving',
  priority = false,
  /** The hero is dark in both themes, so the silhouette needs a rim there too. */
  onDark = false,
  sizes = '(max-width: 640px) 112px, 192px',
}: {
  className?: string
  alt?: string
  priority?: boolean
  onDark?: boolean
  /** Displayed width. The hero is 76–192px; the source file is 1104px. */
  sizes?: string
}) {
  const rim = onDark
    ? 'drop-shadow-[0_0_12px_rgba(255,255,255,0.42)]'
    : 'dark:drop-shadow-[0_0_12px_rgba(255,255,255,0.42)]'
  return (
    <span className={`inline-block align-middle ${className}`}>
      <Image
        src={BRAND_MASCOT_SRC}
        alt={alt}
        width={BRAND_MASCOT_WIDTH}
        height={BRAND_MASCOT_HEIGHT}
        sizes={sizes}
        priority={priority}
        draggable={false}
        className={`h-auto w-full select-none ${rim}`}
      />
    </span>
  )
}
