import { BRAND_ICON_SIZE, BRAND_ICON_SRC } from '@/lib/brand'

/** App icon: black rounded square, transparent outside it, mascot eyes in the middle. */
export function VibePeepMark({ className = 'w-10 h-10', decorative = false }: { className?: string; decorative?: boolean }) {
  return (
    <img
      src={BRAND_ICON_SRC}
      alt={decorative ? '' : 'VibePeep'}
      width={BRAND_ICON_SIZE}
      height={BRAND_ICON_SIZE}
      draggable={false}
      className={`inline-block shrink-0 select-none ${className}`}
    />
  )
}
